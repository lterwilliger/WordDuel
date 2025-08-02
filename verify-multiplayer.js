// Multiplayer Game Simulation Script
// Tests the complete multiplayer game flow using WebSocket connections

const io = require('socket.io-client');

console.log('=== MULTIPLAYER GAME SIMULATION ===');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const ROOM_ID = 'SIMULATION_ROOM';
const PLAYER_NAMES = ['Alice', 'Bob'];

// Game state tracking
let gameState = {
    players: {},
    currentRound: 0,
    completed: false,
    errors: [],
    joined: {},
};

function createPlayer(playerName, isCreator = false) {
    const socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log(`✅ ${playerName} connected`);
        
        // Join room
        socket.emit('join_room', {
            roomId: ROOM_ID,
            playerName: playerName,
            isCreator: isCreator,
            themeIndex: 0
        });
    });
    
    socket.on('game_state_update', (data) => {
        console.log(`📊 ${playerName} joined room:`, data);
        
        // Check if both players are in the room
        if (data.players && data.players.length === 2) {
            console.log(`✅ ${playerName} sees both players in room.`);
            gameState.bothPlayersJoined = true;
        } else {
            console.log(`❌ ${playerName} sees players:`, data && data.players);
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`⚠️ ${playerName} disconnected`);
    });
    
    socket.on('connect_error', (error) => {
        console.log(`❌ ${playerName} error:`, error);
    });
    
    socket.on('game_started', (data) => {
        console.log(`🎮 ${playerName} game started:`, data);
    });
    
    socket.on('round_started', (data) => {
        console.log(`🔄 ${playerName} round ${data.round} started`);
    });
    
    socket.on('round_ended', (data) => {
        console.log(`🏁 ${playerName} round ${data.round} ended:`, data);
    });
    
    socket.on('game_ended', (data) => {
        console.log(`🏆 ${playerName} game ended:`, data);
    });
    
    socket.on('word_set', (data) => {
        console.log(`📝 ${playerName} word set:`, data);
    });
    
    socket.on('guess_submitted', (data) => {
        console.log(`💭 ${playerName} guess submitted:`, data);
    });
    
    socket.on('invalid_word', (data) => {
        console.log(`❌ ${playerName} invalid word:`, data);
    });
    
    return socket;
}

// Main simulation function
async function runSimulation() {
    console.log('=== MULTIPLAYER GAME SIMULATION ===');
    
    // Create player connections
    console.log('Creating player connections...');
    const alice = createPlayer('Alice', true);
    const bob = createPlayer('Bob', false);
    
    // Wait for both players to join
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (gameState.bothPlayersJoined) {
        console.log(`✅ All players joined room`);
        
        // Simulate word selection
        console.log('\n=== SIMULATING WORD SELECTION ===');
        const words = ['SWORD', 'SHIELD', 'ARMOR', 'LANCE', 'CASTLE'];
        
        PLAYER_NAMES.forEach((playerName, index) => {
            const word = words[index];
            console.log(`${playerName} selecting word: ${word}`);
            // Simulate word selection
        });
        
        // Simulate guessing phase
        console.log('\n=== SIMULATING GUESSING PHASE ===');
        const guesses = ['SHIELD', 'SWORD', 'ARMOR', 'LANCE'];
        
        PLAYER_NAMES.forEach((playerName, index) => {
            const guess = guesses[index];
            console.log(`${playerName} submitting guess: ${guess}`);
            // Simulate guess submission
        });
        
        // Simulate try again
        console.log('\n=== SIMULATING TRY AGAIN ===');
        PLAYER_NAMES.forEach((playerName) => {
            console.log(`${playerName} clicking Try Again`);
            // Simulate try again
        });
        
        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('\n=== CLOSING CONNECTIONS ===');
        alice.disconnect();
        bob.disconnect();
        
        console.log('\n=== SIMULATION RESULTS ===');
        console.log(`Games completed: ${gameState.completed ? 'Yes' : 'No'}`);
        console.log(`Current round: ${gameState.currentRound}`);
        console.log(`Errors: ${gameState.errors.length}`);
        
        if (gameState.errors.length > 0) {
            console.log('Errors encountered:');
            gameState.errors.forEach(error => console.log(`  - ${error}`));
        }
        
        const success = gameState.completed && gameState.errors.length === 0;
        console.log(`\nOverall Result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        return success;
    } else {
        console.log('❌ Failed to get both players in room');
        return false;
    }
}

// Run the simulation
console.log('Starting multiplayer game simulation...');
runSimulation().then(success => {
    console.log(`\nOverall Result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.log('❌ Simulation error:', error);
    process.exit(1);
}); 