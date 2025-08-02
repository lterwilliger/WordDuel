// === STATS TRACKING ===
function getStats() {
    return JSON.parse(localStorage.getItem('dordleStats') || '{"played":0,"wins":0,"streak":0,"bestStreak":0}');
}
function saveStats(stats) {
    localStorage.setItem('dordleStats', JSON.stringify(stats));
}
function updateStats(win) {
    const stats = getStats();
    stats.played++;
    if (win) {
        stats.wins++;
        stats.streak++;
        if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
    } else {
        stats.streak = 0;
    }
    saveStats(stats);
}
function updateStatsModal() {
    const stats = getStats();
    document.getElementById('stat-played').textContent = stats.played;
    document.getElementById('stat-wins').textContent = stats.wins;
    document.getElementById('stat-streak').textContent = stats.streak;
    document.getElementById('stat-best-streak').textContent = stats.bestStreak;
}

// Import word lists
import { MEDIEVAL_WORDS } from './words-medieval.js';
import { SCIFI_WORDS } from './words-scifi.js';
import { STANDARD_WORDS } from './words-standard.js';

// Log word list loading
console.log('Medieval words loaded:', MEDIEVAL_WORDS.length);
console.log('Sci-Fi words loaded:', SCIFI_WORDS.length);
console.log('Standard words loaded:', STANDARD_WORDS.length);

// === THEME SUPPORT ===
// Initialize themes with word lists
const THEMES = [
    {
        name: 'Medieval',
        words: MEDIEVAL_WORDS,
        className: 'medieval-theme',
        titleIcon: '⚔️',
        subtitle: 'Medieval Jousting Tournament',
        choosePrompt: 'Choose Your Weapon, Noble Knights!',
        selectPrompt: 'Select your secret word:',
        opponentPrompt: 'Computer will choose a secret word',
        duelBtn: '⚔️ Begin the Duel! ⚔️',
        submitBtn: 'Submit Guess',
        playAgainBtn: 'Try Again',
        playerLabel: '🏰 You (Knight)',
        opponentLabel: '🤖 Computer (Wizard)'
    },
    {
        name: 'Sci-Fi',
        words: SCIFI_WORDS,
        className: 'scifi-theme',
        titleIcon: '🚀',
        subtitle: 'Space Battle Tournament',
        choosePrompt: 'Choose Your Weapon, Space Warriors!',
        selectPrompt: 'Select your secret word:',
        opponentPrompt: 'Computer will choose a secret word',
        duelBtn: '🚀 Begin the Battle! 🚀',
        submitBtn: 'Submit Guess',
        playAgainBtn: 'Try Again',
        playerLabel: '🚀 You (Pilot)',
        opponentLabel: '🤖 Computer (AI)'
    },
    {
        name: 'Standard',
        words: STANDARD_WORDS,
        className: 'standard-theme',
        titleIcon: '📚',
        subtitle: 'Classic Word Tournament',
        choosePrompt: 'Choose Your Word, Players!',
        selectPrompt: 'Select your secret word:',
        opponentPrompt: 'Computer will choose a secret word',
        duelBtn: '📚 Begin the Game! 📚',
        submitBtn: 'Submit Guess',
        playAgainBtn: 'Try Again',
        playerLabel: '📚 You (Player)',
        opponentLabel: '🤖 Computer (AI)'
    }
];

// Initialize theme selection
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DOM loaded, initializing theme selection...');
        
        // Theme selection logic
        const radios = document.querySelectorAll('input[name="theme-radio"]');
        const themeLabels = document.querySelectorAll('.theme-btn');
        
        console.log('Found radios:', radios.length);
        console.log('Found theme labels:', themeLabels.length);
        
        // Handle label clicks
        themeLabels.forEach((label, idx) => {
            label.addEventListener('click', (e) => {
                e.preventDefault();
                radios[idx].checked = true;
                selectedThemeIdx = idx;
                updateThemePreview(selectedThemeIdx);
            });
        });
        
        // Handle radio changes
        radios.forEach((radio, idx) => {
            radio.addEventListener('change', () => {
                selectedThemeIdx = idx;
                updateThemePreview(selectedThemeIdx);
            });
        });
        
        // Continue button
        const continueBtn = document.getElementById('theme-continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const checkedRadio = document.querySelector('input[name="theme-radio"]:checked');
                if (checkedRadio) {
                    showGameUI(parseInt(checkedRadio.value));
                }
            });
        } else {
            console.error('Continue button not found!');
        }
        
        // Back to theme button
        const backBtn = document.getElementById('back-to-theme');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (duelWordleInstance) duelWordleInstance.resetGame();
                showThemeSelect();
            });
        }
        
        // Initialize theme selection
        showThemeSelect();
        
        // Stats modal logic
        const statsModal = document.getElementById('stats-modal');
        const closeStats = document.getElementById('close-stats');
        if (closeStats) {
            closeStats.addEventListener('click', () => {
                statsModal.classList.add('hidden');
            });
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === statsModal) {
                statsModal.classList.add('hidden');
            }
        });
        
        console.log('Theme selection initialized successfully');
        
        // Add global test functions for debugging
        window.testRestart = testRestartFunctionality;
        window.testGame = testGameFunctionality;
        window.verifyAll = verifyAllActions;
        
    } catch (error) {
        console.error('Error initializing theme selection:', error);
    }
}); 