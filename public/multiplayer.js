// Socket.io connection
const socket = io();

// Game state
let gameState = {
    roomId: null,
    playerName: null,
    themeIndex: 0,
    phase: 'lobby', // lobby, setup, game, results
    players: [],
    round: 1,
    maxRounds: 6,
    currentRoundGuesses: 0,
    gameComplete: false,
    mySecretWord: null,
    myGuesses: [],
    opponentGuesses: [],
    roundResults: null,
    isRoomCreator: false,
    myGuessFeedbacks: [],
    opponentGuessFeedbacks: [],
    wordSubmitted: false // Track if word has been submitted to server
};

// Track previous phase for setup phase logic
let previousPhase = null;

// State persistence functions
function saveLocalState() {
    if (gameState.roomId) {
        const stateToSave = {
            mySecretWord: gameState.mySecretWord,
            wordSubmitted: gameState.wordSubmitted,
            roomId: gameState.roomId
        };
        sessionStorage.setItem('dordle_local_state', JSON.stringify(stateToSave));
    }
}

function loadLocalState() {
    try {
        const saved = sessionStorage.getItem('dordle_local_state');
        if (saved) {
            const state = JSON.parse(saved);
            if (state.roomId === gameState.roomId) {
                gameState.mySecretWord = state.mySecretWord;
                gameState.wordSubmitted = state.wordSubmitted;
                console.log('Loaded local state:', state);
                return true;
            }
        }
    } catch (e) {
        console.error('Error loading local state:', e);
    }
    return false;
}

function clearLocalState() {
    sessionStorage.removeItem('dordle_local_state');
}

// Theme configuration
const THEMES = [
    {
        name: 'Medieval',
        className: 'theme-medieval',
        words: MEDIEVAL_WORDS,
        subtitle: 'A Medieval Jousting of Words',
        playerLabel: '🏰 Your Guesses',
        opponentLabel: '👥 Opponent\'s Guesses',
        choosePrompt: 'Choose Your Secret Word',
        selectPrompt: 'Select your secret word:',
        opponentPrompt: 'Waiting for opponent to choose...',
        duelBtn: '⚔️ Begin the Duel! ⚔️',
        submitBtn: 'Strike! ⚔️',
        playAgainBtn: '⚔️ Another Duel! ⚔️',
        titleIcon: '⚔️'
    },
    {
        name: 'Sci-Fi',
        className: 'theme-scifi',
        words: SCIFI_WORDS,
        subtitle: 'A Galactic Duel of Wits',
        playerLabel: '🚀 Your Guesses',
        opponentLabel: '👾 Opponent\'s Guesses',
        choosePrompt: 'Select Your Secret Codeword',
        selectPrompt: 'Select your secret codeword:',
        opponentPrompt: 'Waiting for opponent to choose...',
        duelBtn: '🚀 Initiate Battle! 🚀',
        submitBtn: 'Fire! 🚀',
        playAgainBtn: '🚀 Try Again! 🚀',
        titleIcon: '🚀'
    },
    {
        name: 'Standard',
        className: 'theme-standard',
        words: STANDARD_WORDS,
        subtitle: 'A Sharp Showdown of Wordsmiths',
        playerLabel: '🧑 Your Guesses',
        opponentLabel: '👤 Opponent\'s Guesses',
        choosePrompt: 'Choose Your Secret Word',
        selectPrompt: 'Select your secret word:',
        opponentPrompt: 'Waiting for opponent to choose...',
        duelBtn: 'Start Game!',
        submitBtn: 'Submit!',
        playAgainBtn: '🔄 Play Again! 🔄',
        titleIcon: '📚'
    }
];

// DOM elements
const elements = {
    modeSelectScreen: document.getElementById('mode-select-screen'),
    roomJoinScreen: document.getElementById('room-join-screen'),
    gameRoot: document.getElementById('game-root'),
    waitingScreen: document.getElementById('waiting-screen'),
    singlePlayerBtn: document.getElementById('single-player-btn'),
    multiplayerBtn: document.getElementById('multiplayer-btn'),
    backToModeBtn: document.getElementById('back-to-mode'),
    playerName: document.getElementById('player-name'),
    roomId: document.getElementById('room-id'),

    backToLobbyBtn: document.getElementById('back-to-lobby'),
    themeName: document.getElementById('theme-name'),
    gameSubtitle: document.getElementById('game-subtitle'),
    currentStatus: document.getElementById('current-status'),
    currentRound: document.getElementById('current-round'),
    roomDisplay: document.getElementById('room-display'),
    waitingRoomCode: document.getElementById('waiting-room-code'),
    selectedTheme: document.getElementById('selected-theme'),
    themeSelectionCreator: document.getElementById('theme-selection-creator'),

    setupPhase: document.getElementById('setup-phase'),
    gamePhase: document.getElementById('game-phase'),
    resultsPhase: document.getElementById('results-phase'),
    playerOptions: document.getElementById('player-options'),
    opponentStatus: document.getElementById('opponent-status'),
    startGameBtn: document.getElementById('start-game'),
    roundNumber: document.getElementById('round-number'),
    roundStatus: document.getElementById('round-status'),
    yourDisplay: document.getElementById('your-display'),
    yourHistory: document.getElementById('your-history'),
    opponentDisplay: document.getElementById('opponent-display'),
    opponentHistory: document.getElementById('opponent-history'),
    guessInput: document.getElementById('guess-input'),
    submitGuessBtn: document.getElementById('submit-guess'),
    keyboard: document.getElementById('keyboard'),
    winnerAnnouncement: document.getElementById('winner-announcement'),
    finalScores: document.getElementById('final-scores'),
    playAgainBtn: document.getElementById('play-again')
};

// Initialize the game
function init() {
    setupEventListeners();
    createKeyboard();
    
    // Apply default theme
    const defaultTheme = THEMES[0];
    if (defaultTheme) {
        applyTheme(defaultTheme);
    }
    
    showScreen('mode-select');
}

// Dev guardrail for layout detection
function devAssertLayout() {
    const appEl = document.querySelector('.container') || document.getElementById('game-root') || document.getElementById('root');
    if (!appEl) return;
    const w = appEl.getBoundingClientRect().width;
    if (w < window.innerWidth * 0.6) {
        console.warn('Layout too narrow; forcing anti-scale override');
        document.body.classList.add('layout-bug');
    } else {
        document.body.classList.remove('layout-bug');
    }
}
window.addEventListener('load', devAssertLayout);
window.addEventListener('resize', devAssertLayout);

// Event listeners
function setupEventListeners() {
    // Mode selection
    elements.singlePlayerBtn.addEventListener('click', startSinglePlayer);
    elements.multiplayerBtn.addEventListener('click', startMultiplayer);
    
    // Room management
    elements.backToModeBtn.addEventListener('click', backToModeSelect);
    elements.backToLobbyBtn.addEventListener('click', backToLobby);
    
    // New enter room functionality
    const enterRoomBtn = document.getElementById('enter-room-btn');
    if (enterRoomBtn) {
        enterRoomBtn.addEventListener('click', enterRoom);
    }
    
    // Scoring info toggle
    const scoringToggle = document.getElementById('scoring-toggle');
    const scoringInfo = document.getElementById('scoring-info');
    if (scoringToggle && scoringInfo) {
        scoringToggle.addEventListener('click', () => {
            scoringInfo.classList.toggle('show');
        });
        
        // Close scoring info when clicking outside
        document.addEventListener('click', (e) => {
            if (!scoringToggle.contains(e.target) && !scoringInfo.contains(e.target)) {
                scoringInfo.classList.remove('show');
            }
        });
    }
    
    // Game setup
    elements.startGameBtn.addEventListener('click', startGame);
    
    // Game phase
    elements.submitGuessBtn.addEventListener('click', submitGuess);
    elements.guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitGuess();
    });
    
    // Results
    elements.playAgainBtn.addEventListener('click', playAgain);
    
    // Theme selection for join screen
    const themeRadiosJoin = document.querySelectorAll('input[name="theme-radio-join"]');
    themeRadiosJoin.forEach((radio, idx) => {
        radio.addEventListener('change', () => {
            // Apply theme immediately for preview
            const theme = THEMES[idx];
            if (theme) {
                applyTheme(theme);
            }
        });
    });
}

// Mode selection handlers
function startSinglePlayer() {
    // Redirect to single player game
    window.location.href = '/single';
}

function startMultiplayer() {
    showScreen('room-join');
}

function backToModeSelect() {
    showScreen('mode-select');
}

// Socket.io event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    
    // Set up fallback timeout for pending leave operations
    if (gameState.waitingForLeaveConfirmation) {
        setTimeout(() => {
            if (gameState.waitingForLeaveConfirmation) {
                console.log('Fallback: completing back to lobby after timeout');
                const currentThemeIndex = gameState.themeIndex;
                completeBackToLobby(currentThemeIndex);
            }
        }, 2000); // 2 second fallback
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    
    // If we were waiting to leave a room, complete the process
    if (gameState.waitingForLeaveConfirmation) {
        console.log('Connection lost while leaving room, completing back to lobby');
        const currentThemeIndex = gameState.themeIndex;
        completeBackToLobby(currentThemeIndex);
    }
});

socket.on('game_state_update', (state) => {
    console.log('=== Game state update received ===');
    console.log('Previous phase:', gameState.phase);
    console.log('New phase:', state.phase);
    console.log('Players in state:', state.players?.length || 0);
    
    // Clear roundResults if a new round starts or phase is 'game'
    if (state.phase === 'game') {
        gameState.roundResults = null;
    }
    
    updateGameState(state);
    
    // Show game screen if we're in setup, game, or results phase
    if (state.phase === 'setup' || state.phase === 'game' || state.phase === 'results') {
        console.log('Transitioning to game screen, phase:', state.phase);
        showScreen('game');
    }
    
    updateUI();
    updateWaitingScreen();
});

socket.on('round_results', (results) => {
    console.log('Round results:', results);
    gameState.roundResults = results;
    updateRoundResults(results);
});

socket.on('waiting_for_opponent', (data) => {
    console.log('Waiting for opponent:', data);
    updateWaitingStatus(data);
});

socket.on('player_disconnected', (data) => {
    console.log('Player disconnected:', data);
    showMessage('Opponent disconnected', 'error');
    
    // Only auto-return to lobby if we're not already in the process of leaving
    if (!gameState.waitingForLeaveConfirmation) {
        setTimeout(() => {
            backToLobby();
        }, 3000);
    }
});

socket.on('word_options', ({ wordOptions }) => {
    console.log('Received word options from server:', wordOptions);
    gameState.wordOptions = wordOptions;
    // Regenerate word options in UI if we're in setup phase
    if (gameState.phase === 'setup') {
        generateWordOptions();
    }
});

socket.on('room_left', () => {
    console.log('Room left confirmation received');
    if (gameState.waitingForLeaveConfirmation) {
        // Complete the back to lobby process
        const currentThemeIndex = gameState.themeIndex;
        completeBackToLobby(currentThemeIndex);
    }
});

// Room management
async function getRoomStatus(roomId) {
    const res = await fetch(`/api/room-status/${roomId}`);
    return await res.json();
}

// Helper to get selected theme index from join screen
function getSelectedThemeIndex() {
    const checked = document.querySelector('input[name="theme-radio-join"]:checked');
    return checked ? parseInt(checked.value) : 0;
}



// New enter room function with smart logic
async function enterRoom() {
    const playerName = elements.playerName.value.trim();
    let roomId = elements.roomId.value.trim().toUpperCase();
    const themeIndex = getSelectedThemeIndex();
    
    if (!playerName) {
        showMessage('Please enter your name', 'error');
        return;
    }
    
    // Show loading state
    const enterRoomBtn = document.getElementById('enter-room-btn');
    const btnText = enterRoomBtn.querySelector('.btn-text');
    const btnLoading = enterRoomBtn.querySelector('.btn-loading');
    const loadingText = btnLoading.querySelector('.loading-text');
    
    enterRoomBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    
    try {
        // If no room code entered, generate one and create room
        if (!roomId) {
            roomId = generateRoomCode();
            loadingText.textContent = 'Creating room...';
            
            gameState.playerName = playerName;
            gameState.roomId = roomId;
            gameState.isRoomCreator = true;
            gameState.themeIndex = themeIndex;
            
            // Load local state if available
            loadLocalState();
            
            // Apply theme immediately
            const theme = THEMES[themeIndex];
            if (theme) {
                applyTheme(theme);
            }
            
            socket.emit('join_room', {
                roomId: roomId,
                playerName: playerName,
                isCreator: true,
                themeIndex: themeIndex
            });
            
            showScreen('waiting');
            elements.waitingRoomCode.textContent = roomId;
            elements.roomId.value = roomId;
            return;
        }
        
        // Check if room exists
        loadingText.textContent = 'Checking room...';
        const status = await getRoomStatus(roomId);
        
        if (status.exists && status.playerCount === 1) {
            // Room exists with 1 player - join it
            loadingText.textContent = 'Joining room...';
            
            gameState.playerName = playerName;
            gameState.roomId = roomId;
            gameState.isRoomCreator = false;
            
            socket.emit('join_room', {
                roomId: roomId,
                playerName: playerName
            });
            
            showScreen('waiting');
            elements.waitingRoomCode.textContent = roomId;
        } else if (!status.exists || status.playerCount === 0) {
            // Room doesn't exist or is empty - create it
            loadingText.textContent = 'Creating room...';
            
            gameState.playerName = playerName;
            gameState.roomId = roomId;
            gameState.isRoomCreator = true;
            gameState.themeIndex = themeIndex;
            
            // Load local state if available
            loadLocalState();
            
            // Apply theme immediately
            const theme = THEMES[themeIndex];
            if (theme) {
                applyTheme(theme);
            }
            
            socket.emit('join_room', {
                roomId: roomId,
                playerName: playerName,
                isCreator: true,
                themeIndex: themeIndex
            });
            
            showScreen('waiting');
            elements.waitingRoomCode.textContent = roomId;
        } else {
            // Room is full
            showMessage('Room is full!', 'error');
        }
    } catch (error) {
        console.error('Error entering room:', error);
        showMessage('Failed to enter room. Please try again.', 'error');
    } finally {
        // Reset button state
        enterRoomBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}



function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function backToLobby() {
    // Leave current room if in one
    if (gameState.roomId) {
        socket.emit('leave_room');
    }
    
    // Reset game state
    gameState = {
        roomId: null,
        playerName: null,
        themeIndex: 0,
        phase: 'lobby',
        players: [],
        round: 1,
        maxRounds: 6,
        currentRoundGuesses: 0,
        gameComplete: false,
        mySecretWord: null,
        myGuesses: [],
        opponentGuesses: [],
        roundResults: null,
        isRoomCreator: false,
        myGuessFeedbacks: [],
        opponentGuessFeedbacks: []
    };
    
    // Clear any locked inputs
    elements.guessInput.classList.remove('locked');
    elements.guessInput.readOnly = false;
    elements.guessInput.disabled = false;
    elements.submitGuessBtn.disabled = false;
    
    // Go back to room join screen
    showScreen('room-join');
    updateUI();
}

// Game state management
function updateGameState(state) {
    console.log('=== Game state update ===');
    console.log('Phase:', gameState.phase, '->', state.phase);
    console.log('Round:', gameState.round, '->', state.round);
    
    const previousRound = gameState.round;
    const prevPhase = gameState.phase;
    
    gameState.phase = state.phase;
    gameState.players = state.players;
    gameState.round = state.round;
    gameState.currentRoundGuesses = state.currentRoundGuesses;
    gameState.gameComplete = state.gameComplete;
    gameState.themeIndex = state.themeIndex || 0;
    gameState.wordOptions = state.wordOptions; // Store word options from server
    
    // Find current player data
    const currentPlayer = state.players.find(p => p.id === socket.id);
    if (currentPlayer) {
        gameState.myGuesses = currentPlayer.guessCount;
        gameState.myScore = currentPlayer.score;
        gameState.myHasWon = currentPlayer.hasWon;
        gameState.isRoomCreator = currentPlayer.isCreator;
        
        // Preserve local selection during setup: the server will keep secretWord null
        // until we emit set_secret_word. Only clear outside of setup, e.g., on restart.
        if (state.phase !== 'setup' && currentPlayer.secretWord === null) {
            gameState.mySecretWord = null;
            gameState.wordSubmitted = false;
        }
    }
    
    // Apply theme if it changed
    const theme = THEMES[gameState.themeIndex];
    if (theme) {
        applyTheme(theme);
    }
    
    // Reset feedback arrays if new game or restart
    if (gameState.phase === 'setup') {
        gameState.myGuessFeedbacks = [];
        gameState.opponentGuessFeedbacks = [];
        // Clear word selection on new game (when coming from results)
        if (prevPhase === 'results') {
            gameState.mySecretWord = null;
            gameState.wordSubmitted = false;
        }
    }
    
    // Always update opponent status when game state changes
    updateOpponentStatus();
    if (gameState.phase === 'setup') applyStartButtonState();
    
    // Check if we've moved to a new round (round number increased)
    if (state.round > previousRound && prevPhase === 'game') {
        console.log('New round detected - resetting input state');
        // Clear any round results to allow new input
        gameState.roundResults = null;
        // Reset input state for new round
        resetInputState();
    }
    
    // Check if we've moved from setup to game phase
    if (state.phase === 'game' && prevPhase === 'setup') {
        console.log('Game started - transitioning from setup to game phase');
        // Reset the start button since game has started
        if (elements.startGameBtn) {
            elements.startGameBtn.disabled = true;
            const theme = THEMES[gameState.themeIndex];
            if (theme) {
                elements.startGameBtn.textContent = theme.duelBtn;
            }
        }
    }
    // Save previous phase globally for setup phase logic
    previousPhase = prevPhase;
}

// Helper function to reset input state
function resetInputState() {
    console.log('=== resetInputState called ===');
    
    // If we're in setup phase, don't touch the input
    if (gameState.phase === 'setup') {
        return;
    }
    
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    const hasSolved = myPlayer && myPlayer.hasWon;
    
    if (hasSolved) {
        console.log('Player has solved - keeping input locked');
        // Keep input locked if player has solved
        if (elements.guessInput) {
            elements.guessInput.classList.add('locked');
            elements.guessInput.readOnly = true;
            elements.guessInput.disabled = true;
        }
        if (elements.submitGuessBtn) elements.submitGuessBtn.disabled = true;
    } else {
        console.log('Player hasn\'t solved - enabling input for new round');
        // Enable input for new round
        if (elements.guessInput) {
            elements.guessInput.classList.remove('locked');
            elements.guessInput.readOnly = false;
            elements.guessInput.disabled = false;
            elements.guessInput.value = '';
        }
        if (elements.submitGuessBtn) elements.submitGuessBtn.disabled = false;
        if (elements.roundStatus) elements.roundStatus.textContent = 'Enter your guess below';
    }
}

function applyStartButtonState() {
    if (!elements.startGameBtn) return;
    
    const theme = THEMES[gameState.themeIndex];
    if (!theme) return;
    
    if (gameState.mySecretWord && !gameState.wordSubmitted) {
        elements.startGameBtn.disabled = false;
        elements.startGameBtn.textContent = theme.duelBtn;
    } else {
        elements.startGameBtn.disabled = true;
        elements.startGameBtn.textContent = theme.duelBtn;
    }
}

function getOpponentName() {
    // Return the name of the other player (not this socket)
    if (!gameState.players || gameState.players.length < 2) return 'Opponent';
    const opponent = gameState.players.find(p => p.id !== socket.id);
    return opponent ? opponent.name : 'Opponent';
}

function updateOpponentStatus() {
    const opponentNameEl = document.getElementById('opponent-name');
    const opponentSpinnerEl = document.getElementById('opponent-spinner');
    
    if (gameState.players.length === 2) {
        const opponent = gameState.players.find(p => p.id !== socket.id);
        if (opponent && elements.opponentStatus) {
            if (opponentNameEl) {
                opponentNameEl.textContent = opponent.name;
            }
            
            if (opponent.secretWord) {
                elements.opponentStatus.classList.add('ready');
                if (opponentNameEl) {
                    opponentNameEl.textContent = `${opponent.name} is ready!`;
                }
                if (opponentSpinnerEl) {
                    opponentSpinnerEl.style.display = 'none';
                }
            } else {
                elements.opponentStatus.classList.remove('ready');
                if (opponentNameEl) {
                    opponentNameEl.textContent = `${opponent.name} is choosing...`;
                }
                if (opponentSpinnerEl) {
                    opponentSpinnerEl.style.display = 'block';
                }
            }
        }
    } else if (elements.opponentStatus) {
        elements.opponentStatus.classList.remove('ready');
        if (opponentNameEl) {
            opponentNameEl.textContent = 'Waiting for opponent...';
        }
        if (opponentSpinnerEl) {
            opponentSpinnerEl.style.display = 'block';
        }
    }
}

function applyTheme(theme) {
    // Apply theme class to body
    document.body.className = theme.className;
    
    // Update theme name displays
    if (elements.themeName) elements.themeName.textContent = theme.name;
    if (elements.gameSubtitle) elements.gameSubtitle.textContent = theme.subtitle;
    if (elements.selectedTheme) elements.selectedTheme.textContent = theme.name;
    
    // Update title with theme icon (only if we're in game screen)
    const titleElement = document.querySelector('.title');
    if (titleElement && document.getElementById('game-root').style.display !== 'none') {
        titleElement.innerHTML = `${theme.titleIcon} WordDuel ${theme.titleIcon} <span id="theme-name" style="font-size:1.1rem;margin-left:8px;"></span>`;
        // Re-set the theme name since we replaced the innerHTML
        const themeNameElement = document.getElementById('theme-name');
        if (themeNameElement) {
            themeNameElement.textContent = theme.name;
        }
    }
    
    // Update setup phase text (only if setup phase exists)
    const setupTitle = document.querySelector('.setup-container h2');
    if (setupTitle) setupTitle.textContent = theme.choosePrompt;
    
    const selectPrompt = document.querySelector('.word-selection p');
    if (selectPrompt) selectPrompt.textContent = theme.selectPrompt;
    
    const opponentPrompt = document.querySelectorAll('.word-selection p')[1];
    if (opponentPrompt) opponentPrompt.textContent = theme.opponentPrompt;
    
    // Update buttons
    if (elements.startGameBtn) {
        // Only update text if button is not in "Starting..." state
        if (!elements.startGameBtn.textContent.includes('Starting...')) {
            elements.startGameBtn.textContent = theme.duelBtn;
        }
    }
    if (elements.submitGuessBtn) elements.submitGuessBtn.textContent = theme.submitBtn;
    if (elements.playAgainBtn) elements.playAgainBtn.textContent = theme.playAgainBtn;
    
    // Update board headers
    const yourBoardHeader = document.querySelector('.player-board h4');
    const opponentBoardHeader = document.querySelectorAll('.player-board h4')[1];
    if (yourBoardHeader) yourBoardHeader.textContent = theme.playerLabel;
    if (opponentBoardHeader) opponentBoardHeader.textContent = theme.opponentLabel;
}

function updateUI() {
    const theme = THEMES[gameState.themeIndex];
    
    // Apply theme styling and text
    applyTheme(theme);
    
    // Update room info
    if (elements.roomDisplay) elements.roomDisplay.textContent = gameState.roomId;
    if (elements.currentRound) elements.currentRound.textContent = gameState.round;
    
    // Update phase
    switch (gameState.phase) {
        case 'setup':
            showPhase('setup');
            updateSetupPhase();
            break;
        case 'game':
            showPhase('game');
            updateGamePhase();
            break;
        case 'results':
            showPhase('results');
            updateResultsPhase();
            break;
    }
    
    // Update board headers with opponent name
    const yourBoardHeader = document.querySelector('.player-board h4');
    const opponentBoardHeader = document.querySelectorAll('.player-board h4')[1];
    if (yourBoardHeader) yourBoardHeader.textContent = theme.playerLabel;
    if (opponentBoardHeader) opponentBoardHeader.textContent = theme.opponentLabel;
    
    // Update theme info in waiting screen
    if (elements.selectedTheme) elements.selectedTheme.textContent = theme.name;
    updateRoomJoinThemeUI();
    updateRoomTotalScore();
    
    // Update opponent status
    updateOpponentStatus();
}

function updateWaitingScreen() {
    // Show theme selection for room creators
    if (gameState.isRoomCreator && elements.themeSelectionCreator) {
        elements.themeSelectionCreator.style.display = 'block';
        // Update radio button to match current theme
        const radio = document.querySelector(`input[name="theme-radio-creator"][value="${gameState.themeIndex}"]`);
        if (radio) {
            radio.checked = true;
        }
    } else if (elements.themeSelectionCreator) {
        elements.themeSelectionCreator.style.display = 'none';
    }
    
    // Apply theme to waiting screen
    const theme = THEMES[gameState.themeIndex];
    if (theme) {
        applyTheme(theme);
    }
    
    // Update theme display
    updateThemeDisplay();
}

function updateThemeDisplay() {
    const theme = THEMES[gameState.themeIndex];
    if (elements.selectedTheme && theme) {
        elements.selectedTheme.textContent = theme.name;
    }
}

function updateSetupPhase() {
    console.log('=== updateSetupPhase called ===');
    console.log('Current word options count:', elements.playerOptions?.children?.length || 0);
    console.log('Current mySecretWord:', gameState.mySecretWord);
    console.log('Word submitted:', gameState.wordSubmitted);
    console.log('Word options from server:', gameState.wordOptions);
    
    if (!elements.playerOptions) return;
    
    // Regenerate word options if:
    // 1. Previous phase was 'results' (new game)
    // 2. No word options currently displayed
    // 3. Word options from server are available
    if (previousPhase === 'results' || elements.playerOptions.children.length === 0 || gameState.wordOptions) {
        generateWordOptions();
    }
    
    // Restore selection if we have a selected word (for initial game setup)
    if (gameState.mySecretWord) {
        console.log('Restoring word selection:', gameState.mySecretWord);
        document.querySelectorAll('.word-option').forEach(opt => opt.classList.remove('selected'));
        const selectedOption = Array.from(document.querySelectorAll('.word-option'))
            .find(opt => opt.textContent === gameState.mySecretWord);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
    }
    
    // Find current player in server state
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    
    updateOpponentStatus();
    applyStartButtonState();
}

function updateGamePhase() {
    console.log('=== updateGamePhase called ===');
    
    if (elements.roundNumber) elements.roundNumber.textContent = gameState.round;
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    const hasSolved = myPlayer && myPlayer.hasWon;

    if (gameState.roundResults) {
        // Show round results
        if (elements.roundStatus) elements.roundStatus.textContent = 'Round complete!';
        updateRoundResults(gameState.roundResults);
    } else {
        // Show waiting status - only show waiting if we've already submitted
        const waitingText = gameState.currentRoundGuesses > 0 ? 
            'Waiting for opponent...' : 'Enter your guess below';
        if (elements.roundStatus) elements.roundStatus.textContent = waitingText;
    }
    
    // Update displays
    updateGuessDisplay('your');
    updateGuessDisplay('opponent');
    updateKeyboardColors();
    
    // Handle input/button state
    if (hasSolved) {
        // This player has solved - lock their input
        console.log('Player has solved - locking input');
        if (elements.guessInput) {
            elements.guessInput.classList.add('locked');
            elements.guessInput.readOnly = true;
            elements.guessInput.disabled = true;
        }
        if (elements.submitGuessBtn) elements.submitGuessBtn.disabled = true;
        if (elements.roundStatus) elements.roundStatus.textContent = 'You solved it! Waiting for opponent...';
    } else {
        // This player hasn't solved yet
        if (gameState.currentRoundGuesses > 0) {
            // We've already submitted this round - wait for opponent
            console.log('Already submitted this round - waiting for opponent');
            if (elements.guessInput) {
                elements.guessInput.classList.add('locked');
                elements.guessInput.readOnly = true;
            }
            if (elements.submitGuessBtn) elements.submitGuessBtn.disabled = true;
        } else {
            // New round or haven't submitted yet - enable input
            console.log('New round or haven\'t submitted - enabling input');
            if (elements.guessInput) {
                elements.guessInput.classList.remove('locked');
                elements.guessInput.readOnly = false;
                elements.guessInput.disabled = false;
                elements.guessInput.value = '';
            }
            if (elements.submitGuessBtn) elements.submitGuessBtn.disabled = false;
        }
    }
}

function updateResultsPhase() {
    if (!elements.winnerAnnouncement) return;
    
    const players = gameState.players;
    const opponentName = getOpponentName();
    
    // Improved tie detection
    if (players.length === 2) {
        const player1 = players[0];
        const player2 = players[1];
        
        if (player1.score === player2.score) {
            // It's a tie
            elements.winnerAnnouncement.textContent = '⚔️ It\'s a Tie! ⚔️';
        } else {
            // There's a winner
            const winner = player1.score > player2.score ? player1 : player2;
            const isWinner = winner.id === socket.id;
            elements.winnerAnnouncement.textContent = isWinner ? 
                '🏆 You are the Champion! 🏆' : `🏆 ${opponentName} is the Champion! 🏆`;
        }
    } else {
        // Fallback for edge cases
        const winner = players.find(p => p.score > 0);
        if (winner) {
            const isWinner = winner.id === socket.id;
            elements.winnerAnnouncement.textContent = isWinner ? 
                '🏆 You are the Champion! 🏆' : `🏆 ${opponentName} is the Champion! 🏆`;
        } else {
            elements.winnerAnnouncement.textContent = '⚔️ It\'s a Tie! ⚔️';
        }
    }
    
    updateFinalScores();
    updateRoomTotalScore();
}

// Word selection
function generateWordOptions() {
    if (!elements.playerOptions) return;
    
    // Always use word options from server
    let options = gameState.wordOptions;
    
    if (!options || options.length === 0) {
        console.log('No word options from server, generating locally...');
        const theme = THEMES[gameState.themeIndex];
        const shuffled = [...theme.words].sort(() => Math.random() - 0.5);
        options = shuffled.slice(0, 5);
    } else {
        console.log('Using word options from server:', options);
    }
    
    elements.playerOptions.innerHTML = '';
    options.forEach(word => {
        const option = document.createElement('div');
        option.className = 'word-option';
        option.textContent = word;
        option.addEventListener('click', () => selectWord(word));
        elements.playerOptions.appendChild(option);
    });
}

function selectWord(word) {
    console.log('=== selectWord called ===');
    console.log('Word selected:', word);
    
    if (!word) return;
    
    // Clear previous selections
    document.querySelectorAll('.word-option').forEach(opt => opt.classList.remove('selected'));
    
    // Select new word
    const selectedOption = Array.from(document.querySelectorAll('.word-option'))
        .find(opt => opt.textContent === word);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
    
    gameState.mySecretWord = word;
    
    // Find current player in server state
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    
    updateOpponentStatus();
    // Selecting a word means the player can try to start (until they submit)
    gameState.wordSubmitted = false;
    applyStartButtonState();
}

// Game actions
function startGame() {
    console.log('=== startGame called ===');
    console.log('My secret word:', gameState.mySecretWord);
    console.log('Button disabled:', elements.startGameBtn?.disabled);
    console.log('Word already submitted:', gameState.wordSubmitted);
    
    if (!gameState.mySecretWord) {
        console.log('No secret word selected!');
        return;
    }
    
    if (!elements.startGameBtn || elements.startGameBtn.disabled) {
        console.log('Button is disabled!');
        return;
    }
    
    if (gameState.wordSubmitted) {
        console.log('Word already submitted to server!');
        return;
    }
    
    // Let server handle validation - just submit if we have a word and are in setup phase
    if (!gameState.mySecretWord || gameState.phase !== 'setup') {
        console.log('Cannot start game: must have selected word and be in setup phase.');
        return;
    }

    console.log('Emitting set_secret_word with word:', gameState.mySecretWord);
    socket.emit('set_secret_word', { word: gameState.mySecretWord });
    
    // Mark word as submitted and update button state
    gameState.wordSubmitted = true;
    applyStartButtonState();
    
    // Save state to sessionStorage
    saveLocalState();
}

function submitGuess() {
    console.log('=== submitGuess called ===');
    
    if (!elements.guessInput || !elements.submitGuessBtn) return;
    
    const guess = elements.guessInput.value.toUpperCase().trim();
    console.log('Guess submitted:', guess);
    
    if (guess.length !== 5) {
        showMessage('Please enter a 5-letter word!', 'error');
        return;
    }
    
    if (!isValidWord(guess)) {
        showMessage('Please enter a valid 5-letter word!', 'error');
        return;
    }
    
    console.log('Emitting submit_guess with:', guess);
    socket.emit('submit_guess', { guess: guess });
    
    // Lock the input and keep the guess visible
    elements.guessInput.classList.add('locked');
    elements.guessInput.readOnly = true;
    elements.submitGuessBtn.disabled = true;
    if (elements.roundStatus) {
        elements.roundStatus.textContent = 'Waiting for opponent...';
    }
    
    console.log('Input locked after submission');
}

function isValidWord(word) {
    return word.length === 5 && /^[A-Z]+$/.test(word);
}

// Round results
function updateRoundResults(results) {
    console.log('=== updateRoundResults called ===');
    console.log('Results:', results);
    
    const myResult = results.results.find(r => r.playerId === socket.id);
    const opponentId = (gameState.players.find(p => p.id !== socket.id) || {}).id;
    const opponentResult = results.results.find(r => r.playerId === opponentId);
    
    console.log('My result:', myResult);
    console.log('Opponent result:', opponentResult);
    
    if (!gameState.myGuessFeedbacks) gameState.myGuessFeedbacks = [];
    if (!gameState.opponentGuessFeedbacks) gameState.opponentGuessFeedbacks = [];
    if (myResult) {
        gameState.myGuessFeedbacks.push({ guess: myResult.guess, feedback: myResult.feedback });
    }
    if (opponentResult) {
        gameState.opponentGuessFeedbacks.push({ guess: opponentResult.guess, feedback: opponentResult.feedback });
    }
    
    if (myResult) {
        updateGuessDisplay('your');
        if (myResult.isCorrect) {
            showMessage('You guessed correctly!', 'success');
        }
    }
    
    if (opponentResult) {
        updateGuessDisplay('opponent');
    }
    
    // Update scores
    updateGameBoards();
    updateKeyboardColors();
    
    // Check if game is complete
    if (results.gameComplete) {
        console.log('Game complete - moving to results phase');
        setTimeout(() => {
            gameState.phase = 'results';
            updateUI();
        }, 2000);
    } else {
        console.log('Round complete - preparing for next round');
        // Clear round results to allow new input
        gameState.roundResults = null;
        // The game state update will handle enabling input for next round
    }
}

function updateGuessDisplay(player) {
    const displayElement = document.getElementById(`${player}-display`);
    const historyElement = document.getElementById(`${player}-history`);
    
    if (!displayElement || !historyElement) return;
    
    let correctLetters = Array(5).fill('');
    if (player === 'your') {
        (gameState.myGuessFeedbacks || []).forEach(result => {
            for (let i = 0; i < 5; i++) {
                if (result.feedback[i] === 'correct') {
                    correctLetters[i] = result.guess[i];
                }
            }
        });
    } else if (player === 'opponent') {
        (gameState.opponentGuessFeedbacks || []).forEach(result => {
            for (let i = 0; i < 5; i++) {
                if (result.feedback[i] === 'correct') {
                    correctLetters[i] = result.guess[i];
                }
            }
        });
    }
    displayElement.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const tile = document.createElement('div');
        tile.className = 'letter-tile';
        if (correctLetters[i]) {
            tile.textContent = correctLetters[i];
            tile.classList.add('correct');
        } else {
            tile.textContent = '';
        }
        displayElement.appendChild(tile);
    }
    // Add to history - show all guesses for this player
    historyElement.innerHTML = '';
    const feedbacks = player === 'your' ? gameState.myGuessFeedbacks : gameState.opponentGuessFeedbacks;
    if (feedbacks) {
        feedbacks.forEach(result => {
            const historyItem = document.createElement('div');
            historyItem.className = 'guess-item';
            for (let i = 0; i < result.guess.length; i++) {
                const letterElement = document.createElement('div');
                letterElement.className = 'guess-letter';
                letterElement.textContent = result.guess[i];
                switch (result.feedback[i]) {
                    case 'correct':
                        letterElement.style.background = '#22c55e';
                        letterElement.style.color = '#181c23';
                        break;
                    case 'partial':
                        letterElement.style.background = '#fbbf24';
                        letterElement.style.color = '#181c23';
                        break;
                    case 'incorrect':
                        letterElement.style.background = '#e5e7eb';
                        letterElement.style.color = '#64748b';
                        break;
                }
                historyItem.appendChild(letterElement);
            }
            historyElement.appendChild(historyItem);
        });
    }
}

function updateGameBoards() {
    // Don't override the word displays - they are updated by updateGuessDisplay
    // This function is now just a placeholder to avoid breaking existing calls
}

function updateFinalScores() {
    if (!elements.finalScores) return;
    
    elements.finalScores.innerHTML = '';
    const opponentName = getOpponentName();
    gameState.players.forEach(player => {
        const scoreCard = document.createElement('div');
        scoreCard.className = 'score-card';
        const isMe = player.id === socket.id;
        const cumulativeScore = player.cumulativeScore || 0;
        scoreCard.innerHTML = `
            <h3>${isMe ? '🏰 You' : `👥 ${opponentName}`}</h3>
            <p>This Game: ${player.score} pts</p>
            <p>Guesses: ${player.guessCount}</p>
            <p class="cumulative-score">🏆 Total Score: ${cumulativeScore} pts</p>
        `;
        elements.finalScores.appendChild(scoreCard);
    });
}

function updateWaitingStatus(data) {
    if (elements.currentStatus) {
        elements.currentStatus.textContent = `Waiting for opponent... (${data.submittedPlayers}/${data.totalPlayers})`;
    }
}

function updateKeyboardColors() {
    // Track the best state for each letter: correct > partial > incorrect
    const letterStates = {};
    if (!gameState.myGuessFeedbacks) return;
    gameState.myGuessFeedbacks.forEach(result => {
        for (let i = 0; i < result.guess.length; i++) {
            const letter = result.guess[i];
            const feedback = result.feedback[i];
            if (feedback === 'correct') {
                letterStates[letter] = 'correct';
            } else if (feedback === 'partial' && letterStates[letter] !== 'correct') {
                letterStates[letter] = 'partial';
            } else if (!letterStates[letter]) {
                letterStates[letter] = 'incorrect';
            }
        }
    });
    // Update keyboard
    const keys = document.querySelectorAll('.key');
    if (keys.length === 0) return;
    
    keys.forEach(key => {
        const letter = key.textContent;
        key.classList.remove('correct', 'partial', 'incorrect');
        if (letterStates[letter]) {
            key.classList.add(letterStates[letter]);
        }
    });
}

function updateRoomTotalScore() {
    const roomScoreDiv = document.getElementById('room-total-score');
    if (!roomScoreDiv) return;
    if (!gameState.players || gameState.players.length < 1) {
        roomScoreDiv.style.display = 'none';
        return;
    }
    roomScoreDiv.style.display = '';
    let html = '<div style="font-weight: bold; margin-bottom: 4px;">🏆 Total Scores:</div>';
    gameState.players.forEach(p => {
        const isMe = p.id === socket.id;
        const name = isMe ? 'You' : p.name;
        html += `<div>${name}: <b>${p.cumulativeScore || 0}</b> pts</div>`;
    });
    roomScoreDiv.innerHTML = html;
}

// UI helpers
function showScreen(screen) {
    elements.modeSelectScreen.style.display = screen === 'mode-select' ? '' : 'none';
    elements.roomJoinScreen.style.display = screen === 'room-join' ? '' : 'none';
    elements.gameRoot.style.display = screen === 'game' ? '' : 'none';
    elements.waitingScreen.style.display = screen === 'waiting' ? '' : 'none';
    
    // Apply current theme when switching screens
    const currentTheme = THEMES[gameState.themeIndex];
    if (currentTheme) {
        applyTheme(currentTheme);
    }
}

function showPhase(phase) {
    elements.setupPhase.classList.toggle('hidden', phase !== 'setup');
    elements.gamePhase.classList.toggle('hidden', phase !== 'game');
    elements.resultsPhase.classList.toggle('hidden', phase !== 'results');
}

function createKeyboard() {
    // responsive: grid layout instead of rows
    const letters = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'];
    
    letters.forEach(letter => {
        const key = document.createElement('button');
        key.className = 'key';
        key.textContent = letter;
        key.dataset.letter = letter;
        
        key.addEventListener('click', () => handleKeyClick(letter));
        elements.keyboard.appendChild(key);
    });
}

function handleKeyClick(letter) {
    if (!elements.guessInput) return;
    
    const currentValue = elements.guessInput.value;
    if (currentValue.length < 5) {
        elements.guessInput.value = currentValue + letter;
    }
}

function showMessage(message, type = 'info') {
    if (!message) return;
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(45deg, ${type === 'error' ? '#e74c3c' : '#27ae60'}, ${type === 'error' ? '#c0392b' : '#2ecc71'});
        color: white;
        padding: 15px 30px;
        border-radius: 10px;
        font-family: 'Medieval Sharp', cursive;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    messageElement.textContent = message;
    
    document.body.appendChild(messageElement);
    
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.remove();
        }
    }, 3000);
}

function playAgain() {
    console.log('Play again clicked - restarting game');
    // Emit restart_game event to server instead of disconnecting
    socket.emit('restart_game');
    // The server will handle the restart and send updated game state
}

// Hide theme selection for joiners
function updateRoomJoinThemeUI() {
    const themeSelectionJoin = document.getElementById('theme-selection-join');
    if (!themeSelectionJoin) return;
    
    // When going back to lobby, we don't know yet if they'll be creator, so show it
    // Only hide it when we're actively in a room and know the user is not the creator
    if (gameState.roomId && !gameState.isRoomCreator) {
        themeSelectionJoin.style.display = 'none';
    } else {
        themeSelectionJoin.style.display = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the game
    init();
}); 