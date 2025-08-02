const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());

// Game state management
const games = new Map();
const players = new Map();

// Read word lists from JSON files
function loadWordLists() {
    try {
        // Read the JavaScript files and extract the arrays
        const medievalContent = fs.readFileSync(path.join(__dirname, 'public', 'words-medieval.js'), 'utf8');
        const scifiContent = fs.readFileSync(path.join(__dirname, 'public', 'words-scifi.js'), 'utf8');
        const standardContent = fs.readFileSync(path.join(__dirname, 'public', 'words-standard.js'), 'utf8');
        
        // Extract arrays from the export statements
        const medievalMatch = medievalContent.match(/export const MEDIEVAL_WORDS = (\[.*?\]);/s);
        const scifiMatch = scifiContent.match(/export const SCIFI_WORDS = (\[.*?\]);/s);
        const standardMatch = standardContent.match(/export const STANDARD_WORDS = (\[.*?\]);/s);
        
        if (!medievalMatch || !scifiMatch || !standardMatch) {
            throw new Error('Could not parse word list files');
        }
        
        // Evaluate the arrays (safe since we control the content)
        const MEDIEVAL_WORDS = eval(medievalMatch[1]);
        const SCIFI_WORDS = eval(scifiMatch[1]);
        const STANDARD_WORDS = eval(standardMatch[1]);
        
        console.log(`Loaded word lists: Medieval (${MEDIEVAL_WORDS.length}), Sci-Fi (${SCIFI_WORDS.length}), Standard (${STANDARD_WORDS.length})`);
        
        return { MEDIEVAL_WORDS, SCIFI_WORDS, STANDARD_WORDS };
    } catch (error) {
        console.error('Error loading word lists:', error);
        // Fallback to hardcoded lists if files can't be read
        return {
            MEDIEVAL_WORDS: ['SWORD', 'SHIELD', 'ARMOR', 'LANCE', 'CASTLE', 'KNIGHT', 'QUEEN', 'KING', 'CROWN', 'THRONE'],
            SCIFI_WORDS: ['ALIEN', 'LASER', 'ROBOT', 'CYBER', 'SPACE', 'QUANT', 'PLASM', 'STARS', 'DRONE', 'CLOAK'],
            STANDARD_WORDS: ['ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER', 'AGAIN']
        };
    }
}

const { MEDIEVAL_WORDS, SCIFI_WORDS, STANDARD_WORDS } = loadWordLists();

const THEMES = {
    0: { name: 'Medieval', words: MEDIEVAL_WORDS },
    1: { name: 'Sci-Fi', words: SCIFI_WORDS },
    2: { name: 'Standard', words: STANDARD_WORDS }
};

// Game state class
class GameState {
    constructor(roomId) {
        this.roomId = roomId;
        this.themeIndex = 0; // Default to Medieval
        this.theme = THEMES[this.themeIndex];
        this.phase = 'setup'; // setup, game, results
        this.players = new Map(); // socketId -> player data
        this.round = 1;
        this.maxRounds = 6;
        this.currentRoundGuesses = new Map(); // socketId -> guess
        this.gameComplete = false;
        this.creatorId = null;
        this.isProcessingRound = false; // Prevent concurrent round processing
        this.active = true; // Track if game is active for cleanup
        this.lastActivity = Date.now(); // Track last activity for cleanup
        this.playerWordOptions = new Map(); // socketId -> word options for each player
    }

    addPlayer(socketId, playerName, isCreator = false) {
        this.players.set(socketId, {
            id: socketId,
            name: playerName,
            secretWord: null,
            guesses: [],
            score: 0,
            hasWon: false,
            isCreator: isCreator,
            cumulativeScore: 0 // running total
        });
        
        // Generate unique word options for this player
        this.playerWordOptions.set(socketId, this.generateNewWordOptions());
        
        if (isCreator) {
            this.creatorId = socketId;
        }
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        if (this.creatorId === socketId) {
            this.creatorId = null;
        }
    }

    setTheme(themeIndex) {
        this.themeIndex = themeIndex;
        const originalTheme = THEMES[themeIndex];
        this.theme = {
            name: originalTheme.name,
            words: [...originalTheme.words]
        };
        // Regenerate word options for all players
        for (const [socketId, player] of this.players) {
            this.playerWordOptions.set(socketId, this.generateNewWordOptions());
        }
    }

    generateNewWordOptions() {
        const shuffled = [...this.theme.words].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 5);
    }

    setSecretWord(socketId, word) {
        // Only validate format - if it's 5 letters, accept it
        if (!/^[A-Z]{5}$/.test(word)) {
            return false;
        }
        
        const player = this.players.get(socketId);
        if (player) {
            player.secretWord = word;
            this.lastActivity = Date.now();
            return true;
        }
        return false;
    }

    submitGuess(socketId, guess) {
        // Validate guess input - only check format and length
        if (!/^[A-Z]{5}$/.test(guess)) {
            return null; // Invalid guess format
        }
        
        const player = this.players.get(socketId);
        if (!player || player.hasWon) {
            // Ignore guesses from players who have already won
            return null;
        }
        
        this.currentRoundGuesses.set(socketId, guess);
        this.lastActivity = Date.now(); // Update activity timestamp
        
        // Only require guesses from players who have not yet won
        const unsolvedPlayers = Array.from(this.players.values()).filter(p => !p.hasWon);
        const allUnsolvedSubmitted = unsolvedPlayers.every(p => this.currentRoundGuesses.has(p.id));
        if (allUnsolvedSubmitted) {
            return this.processRound();
        }
        return null; // Still waiting for other unsolved player
    }

    processRound() {
        // Prevent concurrent round processing
        if (this.isProcessingRound) return null;
        this.isProcessingRound = true;
        
        const results = [];
        const players = Array.from(this.players.values());
        
        // Prevent crash if not enough players
        if (players.length < 2) {
            this.isProcessingRound = false;
            return {
                round: this.round,
                results: [],
                gameComplete: false,
                players: players.map(p => ({
                    id: p.id,
                    name: p.name,
                    score: p.score,
                    hasWon: p.hasWon,
                    guessCount: p.guesses.length,
                    cumulativeScore: p.cumulativeScore || 0
                }))
            };
        }

        console.log(`Processing round ${this.round}. Players: ${players.length}`);
        
        // Process each player's guess against their opponent's word
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            const opponent = players[(i + 1) % 2];
            const guess = this.currentRoundGuesses.get(player.id);
            
            if (guess && opponent.secretWord) {
                const isCorrect = guess === opponent.secretWord;
                player.guesses.push(guess);
                
                if (isCorrect && !player.hasWon) {
                    player.hasWon = true;
                    player.score = this.calculateScore(player.guesses.length);
                    console.log(`Player ${player.name} won! Score: ${player.score}`);
                }
                
                results.push({
                    playerId: player.id,
                    guess: guess,
                    targetWord: opponent.secretWord,
                    isCorrect: isCorrect,
                    feedback: this.getGuessFeedback(guess, opponent.secretWord)
                });
            }
        }
        
        // Check if game is complete
        const gameComplete = players.every(p => p.hasWon) || this.round >= this.maxRounds;
        
        if (gameComplete) {
            this.phase = 'results';
            this.gameComplete = true;
            this.active = false; // Mark game as inactive for cleanup
            // Add this game's score to cumulativeScore for each player
            players.forEach(p => {
                p.cumulativeScore = (p.cumulativeScore || 0) + (p.score || 0);
            });
            console.log('Game ended - moving to results phase');
            
            // Schedule cleanup for inactive game
            setTimeout(() => {
                if (!this.active) {
                    games.delete(this.roomId);
                    console.log(`Cleaned up inactive game: ${this.roomId}`);
                }
            }, 10 * 60 * 1000); // 10 minutes
        } else {
            this.round++;
            this.currentRoundGuesses.clear();
        }
        
        this.isProcessingRound = false; // Reset processing flag
        
        return {
            round: this.round,
            results: results,
            gameComplete: gameComplete,
            players: players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                hasWon: p.hasWon,
                guessCount: p.guesses.length,
                cumulativeScore: p.cumulativeScore || 0
            }))
        };
    }

    calculateScore(guessCount) {
        const baseScore = 100;
        const decayRate = 0.7;
        const score = Math.round(baseScore * Math.pow(decayRate, guessCount - 1));
        return Math.max(score, 10);
    }

    getGuessFeedback(guess, targetWord) {
        const feedback = [];
        const letterCount = {};
        
        // Count letters in target word
        for (let letter of targetWord) {
            letterCount[letter] = (letterCount[letter] || 0) + 1;
        }
        
        // Mark correct positions first
        for (let i = 0; i < guess.length; i++) {
            if (guess[i] === targetWord[i]) {
                letterCount[guess[i]]--;
            }
        }
        
        // Generate feedback
        for (let i = 0; i < guess.length; i++) {
            if (guess[i] === targetWord[i]) {
                feedback.push('correct');
            } else if (letterCount[guess[i]] > 0) {
                feedback.push('partial');
                letterCount[guess[i]]--;
            } else {
                feedback.push('incorrect');
            }
        }
        
        return feedback;
    }

    getGameState() {
        return {
            roomId: this.roomId,
            theme: this.theme,
            themeIndex: this.themeIndex,
            phase: this.phase,
            round: this.round,
            maxRounds: this.maxRounds,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                hasWon: p.hasWon,
                guessCount: p.guesses.length,
                isCreator: p.isCreator,
                cumulativeScore: p.cumulativeScore || 0,
                secretWord: p.secretWord || null
            })),
            currentRoundGuesses: this.currentRoundGuesses.size,
            gameComplete: this.gameComplete,
            wordOptions: null // Remove global word options
        };
    }
    // Get word options for a specific player
    getPlayerWordOptions(socketId) {
        return this.playerWordOptions.get(socketId) || [];
    }
}

// Socket.io event handlers
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // In join_room, set themeIndex if provided by creator
    socket.on('join_room', ({ roomId, playerName, isCreator = false, themeIndex }) => {
        console.log(`Player ${playerName} joining room ${roomId} (creator: ${isCreator})`);
        
        socket.join(roomId);
        players.set(socket.id, { roomId, playerName, isCreator });
        
        // Create or get game state
        if (!games.has(roomId)) {
            games.set(roomId, new GameState(roomId));
        }
        
        const game = games.get(roomId);
        // If creator and themeIndex provided, set theme
        if (isCreator && typeof themeIndex === 'number') {
            game.setTheme(themeIndex);
        }
        game.addPlayer(socket.id, playerName, isCreator);
        
        // PHASE FIX: If both players are present, set phase to 'setup'
        if (game.players.size === 2 && game.phase !== 'setup') {
            game.phase = 'setup';
            console.log(`Both players joined. Setting phase to 'setup' for room ${roomId}`);
        }
        
        // Emit game state to all players in room
        console.log(`Room ${roomId} now has ${game.players.size} players, phase: ${game.phase}`);
        io.to(roomId).emit('game_state_update', game.getGameState());
        
        // Send word options to the joining player
        const wordOptions = game.getPlayerWordOptions(socket.id);
        socket.emit('word_options', { wordOptions });
    });
    
    socket.on('set_theme', ({ themeIndex }) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const game = games.get(player.roomId);
        if (!game || !player.isCreator) return;
        
        console.log(`Room creator setting theme to ${themeIndex}`);
        game.setTheme(themeIndex);
        
        // Emit updated game state to all players
        io.to(player.roomId).emit('game_state_update', game.getGameState());
    });
    
    socket.on('set_secret_word', ({ word }) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const game = games.get(player.roomId);
        if (!game) return;
        
        console.log(`Player ${player.playerName} setting secret word: ${word}`);
        
        const success = game.setSecretWord(socket.id, word);
        if (!success) {
            console.log(`Invalid word: ${word} - invalid format (must be 5 letters)`);
            return;
        }
        
        console.log(`Word ${word} set successfully for player ${player.playerName}`);
        
        // Check if both players have set their words AND there are exactly 2 players
        const allPlayersHaveWords = Array.from(game.players.values()).every(p => p.secretWord);
        const hasTwoPlayers = game.players.size === 2;
        
        if (allPlayersHaveWords && hasTwoPlayers) {
            console.log(`Starting game - both players have words and there are 2 players`);
            game.phase = 'game';
            io.to(player.roomId).emit('game_state_update', game.getGameState());
        } else {
            console.log(`Waiting for other player to select word or join`);
            // Emit updated game state to show opponent's word selection status
            io.to(player.roomId).emit('game_state_update', game.getGameState());
        }
    });
    
    socket.on('submit_guess', ({ guess }) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const game = games.get(player.roomId);
        if (!game || game.phase !== 'game') return;
        
        console.log(`Player ${player.playerName} submitted guess: ${guess}`);
        
        const result = game.submitGuess(socket.id, guess);
        
        if (result === null && game.currentRoundGuesses.has(socket.id)) {
            // Invalid guess - notify client
            socket.emit('invalid_guess', { message: 'Invalid guess. Must be 5 letters and in the current theme.' });
            return;
        }
        
        if (result) {
            // Both players have submitted, emit results
            console.log(`Round ${result.round} complete. Game complete: ${result.gameComplete}`);
            io.to(player.roomId).emit('round_results', result);
            io.to(player.roomId).emit('game_state_update', game.getGameState());
        } else {
            // Still waiting for other player
            console.log(`Waiting for opponent. Submitted: ${game.currentRoundGuesses.size}/${game.players.size}`);
            io.to(player.roomId).emit('waiting_for_opponent', {
                submittedPlayers: game.currentRoundGuesses.size,
                totalPlayers: game.players.size
            });
        }
    });
    
    socket.on('restart_game', () => {
        const player = players.get(socket.id);
        if (!player) return;
        const game = games.get(player.roomId);
        if (!game) return;
        
        console.log(`Restarting game in room ${player.roomId}`);
        
        // Reset game state for all players
        game.phase = 'setup';
        game.round = 1;
        game.gameComplete = false;
        game.currentRoundGuesses.clear();
        game.isProcessingRound = false; // Reset processing flag
        
        // Refresh theme to get new words
        game.setTheme(game.themeIndex); // This will regenerate word options for all players
        
        for (const p of game.players.values()) {
            p.secretWord = null;
            p.guesses = [];
            p.score = 0;
            p.hasWon = false;
            // p.cumulativeScore is NOT reset - preserve total scores
        }
        
        // Emit updated game state to all players
        io.to(player.roomId).emit('game_state_update', game.getGameState());
        
        // Send new word options to each player
        for (const [socketId, playerData] of game.players) {
            const wordOptions = game.getPlayerWordOptions(socketId);
            io.to(socketId).emit('word_options', { wordOptions });
        }
        
        console.log(`Game restarted successfully in room ${player.roomId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const player = players.get(socket.id);
        if (player) {
            const game = games.get(player.roomId);
            if (game) {
                game.removePlayer(socket.id);
                game.lastActivity = Date.now(); // Update activity timestamp
                
                // If no players left, remove game
                if (game.players.size === 0) {
                    game.active = false; // Mark as inactive for cleanup
                    games.delete(player.roomId);
                    console.log(`Game ${player.roomId} removed due to no players`);
                } else {
                    // Notify remaining players
                    io.to(player.roomId).emit('player_disconnected', { playerId: socket.id });
                    io.to(player.roomId).emit('game_state_update', game.getGameState());
                    
                    // Schedule cleanup for inactive game
                    setTimeout(() => {
                        if (!game.active) {
                            games.delete(player.roomId);
                            console.log(`Cleaned up inactive game: ${player.roomId}`);
                        }
                    }, 10 * 60 * 1000); // 10 minutes
                }
            }
            
            players.delete(socket.id);
        }
    });
    
    // Handle manual disconnect (back to lobby)
    socket.on('leave_room', () => {
        console.log('User leaving room:', socket.id);
        
        const player = players.get(socket.id);
        if (player) {
            const game = games.get(player.roomId);
            if (game) {
                game.removePlayer(socket.id);
                game.lastActivity = Date.now(); // Update activity timestamp
                
                // If no players left, remove game
                if (game.players.size === 0) {
                    game.active = false; // Mark as inactive for cleanup
                    games.delete(player.roomId);
                    console.log(`Game ${player.roomId} removed due to no players`);
                } else {
                    // Notify remaining players
                    io.to(player.roomId).emit('player_disconnected', { playerId: socket.id });
                    io.to(player.roomId).emit('game_state_update', game.getGameState());
                    
                    // Schedule cleanup for inactive game
                    setTimeout(() => {
                        if (!game.active) {
                            games.delete(player.roomId);
                            console.log(`Cleaned up inactive game: ${player.roomId}`);
                        }
                    }, 10 * 60 * 1000); // 10 minutes
                }
            }
            
            players.delete(socket.id);
        }
    });
});

// Room status API for frontend validation
app.get('/api/room-status/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const game = games.get(roomId);
    if (!game) {
        return res.json({ exists: false, playerCount: 0 });
    }
    return res.json({ exists: true, playerCount: game.players.size });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'multiplayer.html'));
});

app.get('/single', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test-button', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test-button.html'));
});

app.get('/test-input', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test-input.html'));
});

app.get('/test-button-simple', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test-button-simple.html'));
});

app.get('/api/themes', (req, res) => {
    res.json(THEMES);
});

// Static middleware - serve files from public directory only
app.use(express.static(path.join(__dirname, 'public')));

// 404 handler for unknown routes
app.use((req, res) => {
    res.status(404).send('Page not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 