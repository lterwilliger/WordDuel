const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const ROOM_ID = 'TEST' + Date.now(); // Unique room ID
const PLAYER1 = { name: 'Alice', guesses: ['CABLE', 'DELTA'] };
const PLAYER2 = { name: 'Bob', guesses: ['APPLE', 'BRICK'] };

function createPlayer(player, isCreator) {
    console.log(`[${player.name}] Creating player (creator: ${isCreator})`);
    
    const socket = io(SERVER_URL, { 
        transports: ['websocket'],
        timeout: 10000
    });
    
    let gameCount = 0;
    let submittedWord = false;
    let submittedGuess = false;
    let inResults = false;
    let joinedRoom = false;

    socket.on('connect', () => {
        console.log(`[${player.name}] Connected to server`);
        if (!joinedRoom) {
            socket.emit('join_room', {
                roomId: ROOM_ID,
                playerName: player.name,
                isCreator,
                themeIndex: 0
            });
            console.log(`[${player.name}] Emitted join_room for room ${ROOM_ID}`);
            joinedRoom = true;
        }
    });

    socket.on('connect_error', (error) => {
        console.error(`[${player.name}] Connection error:`, error.message);
    });

    socket.on('disconnect', (reason) => {
        console.log(`[${player.name}] Disconnected: ${reason}`);
    });

    socket.on('word_options', ({ wordOptions }) => {
        console.log(`[${player.name}] Received word options:`, wordOptions);
        // Store word options for this player
        player.wordOptions = wordOptions;
    });
    
    socket.on('game_state_update', (state) => {
        console.log(`[${player.name}] Game state update - Phase: ${state.phase}, Players: ${state.players?.length || 0}`);
        
        const me = state.players?.find(p => p.name === player.name);
        if (!me) {
            return;
        }
        
        console.log(`[${player.name}] My state - Secret word: ${me.secretWord}, Guess count: ${me.guessCount}`);
        
        // Use player's specific word options
        const wordOptions = player.wordOptions || [];
        
        // Simulate word selection UI: only submit when 'Initiate Battle' (here, after word is chosen and not yet submitted)
        if (state.phase === 'setup' && !submittedWord) {
            if (!me.secretWord) {
                // Select first word from player's word options
                if (wordOptions.length > 0) {
                    const word = wordOptions[0]; // Use first word from server options
                    console.log(`[${player.name}] Selecting word: ${word}`);
                    setTimeout(() => {
                        if (!submittedWord) {
                            console.log(`[${player.name}] Clicking Initiate Battle with word: ${word}`);
                            socket.emit('set_secret_word', { word });
                            submittedWord = true;
                        }
                    }, 500 + (isCreator ? 0 : 200));
                }
            }
        }
        // Simulate guessing phase
        if (state.phase === 'game' && !submittedGuess && me.secretWord) {
            if (me.guessCount === 0) {
                const guess = player.guesses[gameCount];
                console.log(`[${player.name}] Submitting guess: ${guess}`);
                setTimeout(() => {
                    if (!submittedGuess) {
                        socket.emit('submit_guess', { guess });
                        submittedGuess = true;
                    }
                }, 500 + (isCreator ? 0 : 200));
            }
        }
        // Reset for next game
        if (state.phase === 'setup' && inResults) {
            console.log(`[${player.name}] Resetting for next game`);
            submittedWord = false;
            submittedGuess = false;
            inResults = false;
        }
    });

    socket.on('round_results', (results) => {
        console.log(`[${player.name}] Round results:`, results);
        if (results.gameComplete) {
            inResults = true;
            gameCount++;
            console.log(`[${player.name}] Game ${gameCount} complete`);
            if (gameCount < 2) {
                // Simulate clicking 'Try Again' after results
                setTimeout(() => {
                    console.log(`[${player.name}] Clicking Try Again`);
                    socket.emit('restart_game');
                }, 500);
            } else {
                // End simulation after 2 games
                setTimeout(() => {
                    console.log(`[${player.name}] Finished 2 games, disconnecting.`);
                    socket.disconnect();
                }, 1000);
            }
        }
    });

    socket.on('waiting_for_opponent', (data) => {
        console.log(`[${player.name}] Waiting for opponent:`, data);
    });

    socket.on('player_disconnected', (data) => {
        console.log(`[${player.name}] Player disconnected:`, data);
    });

    // Add timeout to prevent hanging
    setTimeout(() => {
        if (socket.connected) {
            console.log(`[${player.name}] Simulation timeout, disconnecting`);
            socket.disconnect();
        }
    }, 60000); // 60 second timeout
}

console.log('Starting WordDuel simulation...');
console.log('Server URL:', SERVER_URL);
console.log('Room ID:', ROOM_ID);

// Simulate both players
createPlayer(PLAYER1, true);
setTimeout(() => createPlayer(PLAYER2, false), 1500); // Increased delay

// Add overall timeout
setTimeout(() => {
    console.log('Simulation timeout reached, exiting');
    process.exit(1); // Exit with error code to indicate timeout
}, 30000); // Reduced to 30 seconds for faster feedback 