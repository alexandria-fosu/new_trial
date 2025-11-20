// --- REQUIRED MODULES ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path'); // Node.js built-in module for file paths

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
// CRUCIAL: Use the port assigned by the hosting environment (process.env.PORT), or 4000 for local development
let PORT = process.env.PORT || 4000; 
const GAME_PIN = '1910'; 
const QUESTION_TIME_LIMIT_MS = 15000; // 15 seconds

// --- QUIZ DATA ---
const quizQuestions = [
    { 
        q: "What is the first book of the Bible?", 
        options: ["A. Exodus", "B. Genesis", "C. Leviticus", "D. Numbers"], 
        correct: "B",
        points: 10
    },
    { 
        q: "Who was swallowed by a great fish?", 
        options: ["A. Elijah", "B. Jonah", "C. Moses", "D. Peter"], 
        correct: "B",
        points: 10
    },
    { 
        q: "How many days and nights did it rain during the flood?", 
        options: ["A. 7 days and 7 nights", "B. 20 days and 20 nights", "C. 40 days and 40 nights", "D. 3 days and 3 nights"], 
        correct: "C",
        points: 10
    },
    { 
        q: "What garden did Adam and Eve live in?", 
        options: ["A. Eden", "B. Gethsemane", "C. Zion", "D. Damascus"], 
        correct: "A",
        points: 10
    },
    { 
        q: "Who led the Israelites out of Egypt?", 
        options: ["A. Abraham", "B. Joshua", "C. Moses", "D. David"], 
        correct: "C",
        points: 10
    }
];

// --- GAME STATE VARIABLES ---
let gameState = {
    status: 'waiting', // waiting, running, results, finished
    currentQuestionIndex: -1,
    players: [], // { id, name, score, lastAnswerTime, streak }
    answersReceived: new Map(), // Stores answers for the current question
    hostId: null,
};

// --- MIDDLEWARE: SERVE STATIC FILES ---
// This crucial line tells Express to serve files from the current directory (where server.js lives).
// When a user accesses /host.html or /player.html, Express finds and serves the file.
app.use(express.static(path.join(__dirname)));

// Optional: Redirect the root path / to host.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'host.html'));
});

// --- SOCKET.IO SETUP ---
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for deployment simplicity
        methods: ["GET", "POST"]
    }
});

// --- HELPER FUNCTIONS ---

/**
 * Finds a player object by their socket ID.
 * @param {string} id - The socket ID.
 * @returns {object|null} The player object or null.
 */
function getPlayer(id) {
    return gameState.players.find(p => p.id === id);
}

/**
 * Calculates score based on correct answer and speed.
 * @param {number} answerTime - Time taken to answer (ms).
 * @param {number} maxTime - Total time available (ms).
 * @param {number} basePoints - Base points for the question.
 * @returns {number} The calculated score.
 */
function calculateScore(answerTime, maxTime, basePoints) {
    const timeFactor = 1 - (answerTime / maxTime); // Faster answers yield higher factor (closer to 1)
    return Math.floor(basePoints * timeFactor * 1.5); // Multiplier for better scoring range
}

/**
 * Generates the current leaderboard sorted by score.
 * @returns {Array} Sorted list of players.
 */
function getLeaderboard() {
    return gameState.players
        .sort((a, b) => b.score - a.score)
        .map(({ id, name, score }) => ({ id, name, score }));
}

/**
 * Sends the current player list to the host.
 */
function updatePlayerList() {
    if (gameState.hostId) {
        io.to(gameState.hostId).emit('playerListUpdate', gameState.players.map(p => ({
            name: p.name,
            score: p.score
        })));
    }
}

/**
 * Starts the next question or ends the game.
 */
function startNextQuestion() {
    gameState.answersReceived.clear();

    if (gameState.currentQuestionIndex < quizQuestions.length - 1) {
        gameState.currentQuestionIndex++;
        gameState.status = 'running';
        const questionData = quizQuestions[gameState.currentQuestionIndex];
        
        const questionPayload = {
            questionNumber: gameState.currentQuestionIndex + 1,
            totalQuestions: quizQuestions.length,
            question: questionData.q,
            options: questionData.options,
            timeLimit: QUESTION_TIME_LIMIT_MS,
            startTime: Date.now() // Send start time for client timing
        };

        // Emit question to the host
        io.to(gameState.hostId).emit('questionUpdate', questionPayload);
        
        // Emit question to all players
        io.to('players').emit('newQuestion', questionPayload);

        // Set a timeout to automatically stop the question
        setTimeout(showResults, QUESTION_TIME_LIMIT_MS + 1000); // 1 second buffer
        
    } else {
        // Game Over
        gameState.status = 'finished';
        const finalLeaderboard = getLeaderboard();
        io.to(gameState.hostId).emit('gameOver', { leaderboard: finalLeaderboard });
        io.to('players').emit('gameOver');
    }
}

/**
 * Processes all answers and displays results.
 */
function showResults() {
    if (gameState.status !== 'running') return;
    
    gameState.status = 'results';
    
    const currentQuestion = quizQuestions[gameState.currentQuestionIndex];
    let correctAnswersCount = 0;
    
    // Process answers and update scores
    gameState.answersReceived.forEach((answerData, playerId) => {
        const player = getPlayer(playerId);
        if (!player) return; // Player disconnected

        const isCorrect = answerData.answer === currentQuestion.correct;

        io.to(playerId).emit('answerFeedback', { 
            isCorrect: isCorrect, 
            correctAnswer: currentQuestion.correct 
        });

        if (isCorrect) {
            correctAnswersCount++;
            // Calculate score based on time
            const score = calculateScore(answerData.timeTaken, QUESTION_TIME_LIMIT_MS, currentQuestion.points);
            player.score += score;
            
            // Send score update to player
            io.to(playerId).emit('scoreUpdate', { score: player.score, pointsEarned: score });
        }
    });

    // Update the leaderboard for all players and host
    const leaderboard = getLeaderboard();
    io.to(gameState.hostId).emit('leaderboardUpdate', { 
        leaderboard: leaderboard, 
        playersAnswered: gameState.answersReceived.size
    });
    
    // Wait a moment before showing the "Next Question" button
    setTimeout(() => {
        io.to(gameState.hostId).emit('showNextButton');
    }, 3000);
}


// --- SOCKET.IO CONNECTION HANDLING ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- HOST HANDLERS ---
    socket.on('hostConnect', () => {
        if (gameState.hostId) {
            // Already a host, reject connection or signal error
            socket.emit('error', 'A host is already connected.');
            return;
        }
        
        gameState.hostId = socket.id;
        console.log(`Host connected with ID: ${socket.id}`);
        socket.emit('hostReady', { pin: GAME_PIN });
        updatePlayerList(); // Send existing player list if any
    });

    socket.on('hostStartGame', () => {
        if (socket.id !== gameState.hostId || gameState.players.length === 0 || gameState.status !== 'waiting') {
            socket.emit('error', 'Cannot start game.');
            return;
        }
        startNextQuestion();
    });

    socket.on('hostNextQuestion', () => {
        if (socket.id !== gameState.hostId || gameState.status !== 'results') {
            socket.emit('error', 'Not the time to move to the next question.');
            return;
        }
        startNextQuestion();
    });

    // --- PLAYER HANDLERS ---
    socket.on('playerJoin', ({ name, pin }) => {
        if (gameState.status !== 'waiting') {
             socket.emit('joinError', 'The game has already started.');
             return;
        }

        if (pin !== GAME_PIN) {
            socket.emit('joinError', 'Invalid game PIN.');
            return;
        }

        // Check for duplicate name (simple check)
        if (gameState.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
             socket.emit('joinError', 'Name is already taken. Try a different one.');
             return;
        }
        
        // Add player to state and 'players' room
        const newPlayer = {
            id: socket.id,
            name: name,
            score: 0,
            lastAnswerTime: null,
            streak: 0
        };
        gameState.players.push(newPlayer);
        socket.join('players');
        console.log(`Player joined: ${name} (${socket.id})`);
        
        socket.emit('joinSuccess', { name, pin: GAME_PIN, score: 0 });
        updatePlayerList();
    });
    
    socket.on('playerAnswer', ({ answer, timeTaken }) => {
        const player = getPlayer(socket.id);
        if (!player || gameState.status !== 'running' || gameState.answersReceived.has(player.id)) {
            // Either not a registered player, game not running, or already answered
            return;
        }
        
        // Record the answer
        gameState.answersReceived.set(player.id, { answer, timeTaken });
        console.log(`Answer received from ${player.name}: ${answer} in ${timeTaken}ms`);

        // Notify host about the new answer count
        if (gameState.hostId) {
            io.to(gameState.hostId).emit('answersCountUpdate', gameState.answersReceived.size);
        }
        
        // If all players have answered, immediately show results
        if (gameState.answersReceived.size === gameState.players.length) {
            showResults();
        }
    });


    // --- DISCONNECT HANDLER ---
    socket.on('disconnect', () => {
        if (socket.id === gameState.hostId) {
            // Host disconnected, reset game state
            gameState.hostId = null;
            gameState.status = 'waiting';
            console.log('Host disconnected. Game reset.');
            io.to('players').emit('hostDisconnected', 'The quiz master disconnected. Please refresh to join a new game.');
        } else {
            // Player disconnected
            const index = gameState.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const disconnectedPlayer = gameState.players.splice(index, 1)[0];
                console.log(`Player disconnected: ${disconnectedPlayer.name}`);
                updatePlayerList();
            }
        }
    });

});

// --- START SERVER ---

function startServer(port) {
    server.listen(port, () => {
        console.log("======================================================");
        console.log(`💜 Bible Quiz Server running on port ${port}`);
        console.log("======================================================");
        console.log(`To play, open these URLs in your browser:`);
        console.log(`  Host Screen: http://localhost:${port}/host.html`);
        console.log(`  Player Device: http://localhost:${port}/player.html`);
        console.log(`Game PIN: ${GAME_PIN}`);
    }).on('error', (err) => {
        console.error(`Error starting server on port ${port}: ${err.message}`);
        if (port !== 0) {
            // Try starting on a random available port if the specified one fails
            console.log("Attempting to start on a random available port...");
            startServer(0);
        }
    });
}

startServer(PORT);