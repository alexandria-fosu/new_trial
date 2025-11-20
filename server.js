// --- SERVER CONFIGURATION AND GAME LOGIC ---

const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
// Socket.io for real-time communication
const io = socketio(server); 

// Serve static files (like host.html and player.html)
app.use(express.static(__dirname));

// Use port 4000 as the primary port
let PORT = process.env.PORT || 4000;
const GAME_PIN = '1910'; // Fixed PIN for simplicity
const QUESTION_TIME_LIMIT_MS = 15000; // 15 seconds per question

// --- GAME STATE ---
const game = {
    state: 'waiting', // 'waiting', 'playing', 'finished', 'score'
    currentQuestionIndex: -1,
    players: new Map(), // Stores { socketId: { name, score, answered } }
    answersReceived: 0,
    currentQuestionStartTime: 0,
    hostSocketId: null
};

// --- GAME DATA (Questions) ---
const questions = [
    { q: "Which apostle was a tax collector?", options: ["A. James", "B. John", "C. Matthew", "D. Judas Iscariot"], correct: "C", points: 33 },
    { q: "What king saw the “writing on the wall”?", options: ["A. Nebuchadnezzar", "B. Darius", "C. Belshazzar", "D. Cyrus"], correct: "C", points: 33 },
    { q: "Who was the left-handed judge who killed King Eglon?", options: ["A. Shamgar", "B. Samson", "C. Othniel", "D. Ehud"], correct: "D", points: 33 },
    { q: "Which prophet married the prostitute Gomer?", options: ["A. Elijah", "B. Jeremiah", "C. Hosea", "D. Isaiah"], correct: "C", points: 33 },
    { q: "What is the last word of the Bible?", options: ["A. Salvation", "B. Grace", "C. Peace", "D. Amen"], correct: "D", points: 33 },
    { q: "Which king's fleet brought gold, silver, ivory, apes, and peacocks every three years?", options: ["A. King Ahab", "B. King David", "C. King Solomon", "D. King Hezekiah"], correct: "C", points: 33 },
    { q: "Who was the first person to be called a “Hebrew”?", options: ["A. Moses", "B. Noah", "C. Isaac", "D. Abram (Abraham)"], correct: "D", points: 33 },
    { q: "Which Old Testament book never mentions God’s name?", options: ["A. Song of Solomon", "B. Lamentations", "C. Esther", "D. Ecclesiastes"], correct: "C", points: 33 },
    { q: "Which prophet confronted King David about his sin with Bathsheba?", options: ["A. Elijah", "B. Samuel", "C. Nathan", "D. Elisha"], correct: "C", points: 33 },
    { q: "What judge defeated the Midianites with only 300 men?", options: ["A. Barak", "B. Samson", "C. Gideon", "D. Jephthah"], correct: "C", points: 33 },
    { q: "Who visited Jesus shortly after His birth according to Matthew?", options: ["A. The shepherds", "B. Anna and Simeon", "C. The wise men (Magi)", "D. John the Baptist"], correct: "C", points: 33 },
    { q: "Who said, “My Lord and my God!” when he saw the risen Jesus?", options: ["A. Peter", "B. John", "C. Philip", "D. Thomas"], correct: "D", points: 33 },
    { q: "What does Hebrews say God’s Word is “sharper than”?", options: ["A. A spear", "B. A battle-ax", "C. Any two-edged sword", "D. A razor"], correct: "C", points: 33 },
    { q: "What were the first disciples Jesus called?", options: ["A. James and John", "B. Philip and Bartholomew", "C. Simon Peter and Andrew", "D. Matthew and Thomas"], correct: "C", points: 33 },
    { q: "What metaphor did Jesus use in John 15 for His relationship with believers?", options: ["A. The shepherd and the sheep", "B. The builder and the house", "C. The vine and the branches", "D. The bread and the wine"], correct: "C", points: 33 },
    { q: "Where did Moses receive the Ten Commandments?", options: ["A. Mount Horeb", "B. Mount Zion", "C. Mount Sinai", "D. Mount Moriah"], correct: "C", points: 33 },
    { q: "According to Malachi, who will rise “with healing in His wings”?", options: ["A. The Messenger of the Covenant", "B. The Angel of the Lord", "C. The Sun of Righteousness", "D. The Day Star"], correct: "C", points: 33 },
    { q: "Name one of Job’s three friends.", options: ["A. Bildad", "B. Zophar", "C. Eliphaz", "D. All of the above"], correct: "D", points: 33 },
    { q: "What cloud guided the Israelites by day?", options: ["A. A pillar of smoke", "B. A pillar of fire", "C. A pillar of cloud", "D. A pillar of light"], correct: "C", points: 33 },
    { q: "What food did God provide the Israelites in the wilderness?", options: ["A. Quail", "B. Honey", "C. Manna", "D. Unleavened bread"], correct: "C", points: 33 },
    { q: "What tribe did God choose to serve as priests?", options: ["A. Judah", "B. Benjamin", "C. The tribe of Levi", "D. Reuben"], correct: "C", points: 33 },
    { q: "Who wrote 1 and 2 Timothy?", options: ["A. Luke", "B. Silas", "C. Timothy", "D. The Apostle Paul"], correct: "D", points: 33 },
    { q: "Which judge defeated the Midianites with only 300 men?", options: ["A. Samson", "B. Gideon", "C. Barak", "D. Othniel"], correct: "B", points: 33 },
    { q: "Who raised Samuel in the tabernacle?", options: ["A. Hannah", "B. Jesse", "C. Eli the priest", "D. Zadok"], correct: "C", points: 33 },
    { q: "In Corinthians, what does Paul call believers collectively?", options: ["A. The body of Christ", "B. The chosen generation", "C. The temple of God", "D. The elect"], correct: "C", points: 33 },
    { q: "What was the name of Hosea’s first son?", options: ["A. Lo-ruhamah", "B. Lo-ammi", "C. Jezreel", "D. Shear-jashub"], correct: "C", points: 33 },
    { q: "Which god of the Philistines fell before the Ark?", options: ["A. Baal", "B. Asherah", "C. Molech", "D. Dagon"], correct: "D", points: 33 },
    { q: "Who got sick almost unto death while serving Paul?", options: ["A. Tychicus", "B. Timothy", "C. Epaphroditus", "D. Titus"], correct: "C", points: 33 },
    { q: "According to Proverbs, what is the beginning of knowledge?", options: ["A. Wisdom", "B. Obedience", "C. The fear of the Lord", "D. Understanding"], correct: "C", points: 33 },
    { q: "What animal does the coming king ride upon after a prophecy made in Zechariah 9?", options: ["A. A horse", "B. A colt", "C. A camel", "D. A donkey"], correct: "D", points: 40 } // Final question is worth more
];

// --- UTILITY FUNCTIONS ---

// Sends the current list of players and scores (for leaderboard)
function broadcastLeaderboard() {
    const leaderboard = Array.from(game.players.values())
        .map(p => ({ name: p.name, score: p.score }))
        .sort((a, b) => b.score - a.score);
    
    // Send to all players
    io.emit('leaderboardUpdate', { 
        leaderboard, 
        state: game.state
    });
    // Send detailed list to host
    if (game.hostSocketId) {
        io.to(game.hostSocketId).emit('playerListUpdate', Array.from(game.players.values()));
    }
}

// Moves to the next question
function nextQuestion() {
    game.currentQuestionIndex++;
    
    // End of game check
    if (game.currentQuestionIndex >= questions.length) {
        game.state = 'finished';
        io.emit('gameOver', { leaderboard: broadcastLeaderboard() });
        console.log('Game Over.');
        return;
    }

    // Reset for new question
    game.state = 'playing';
    game.answersReceived = 0;
    game.currentQuestionStartTime = Date.now();

    // Reset answered flag for all players
    game.players.forEach(p => p.answered = false);

    const questionData = questions[game.currentQuestionIndex];
    
    // Data for host (includes correct answer for display later)
    const hostData = {
        questionNumber: game.currentQuestionIndex + 1,
        totalQuestions: questions.length,
        question: questionData.q,
        options: questionData.options,
        timeLimit: QUESTION_TIME_LIMIT_MS,
        correctAnswer: questionData.correct
    };

    // Data for players (now includes question text and options text)
    const playerData = {
        timeLimit: QUESTION_TIME_LIMIT_MS,
        questionNumber: game.currentQuestionIndex + 1,
        question: questionData.q, 
        options: questionData.options 
    };

    io.to(game.hostSocketId).emit('questionUpdate', hostData);
    io.emit('playerQuestionPrompt', playerData);

    console.log(`Starting Q${game.currentQuestionIndex + 1}: ${questionData.q}`);

    // Set a timer to automatically show the score or move to the next question
    setTimeout(showQuestionResults, QUESTION_TIME_LIMIT_MS);
}

// Calculate and show results for the current question
function showQuestionResults() {
    // Prevent double-triggering if host clicks "Next" early
    if (game.state === 'score' || game.state === 'finished') return;

    game.state = 'score';
    const currentQ = questions[game.currentQuestionIndex];
    
    // Data to show results on the host screen
    io.to(game.hostSocketId).emit('showResults', {
        correctAnswer: currentQ.correct,
        playersAnswered: game.answersReceived,
        totalPlayers: game.players.size
    });

    // Send updated scores to everyone
    broadcastLeaderboard();

    // Wait a few seconds to let players see the results before moving on
    setTimeout(() => {
        if (game.hostSocketId) {
            io.to(game.hostSocketId).emit('showNextButton');
        } else {
            // If host disconnected, auto-advance
            nextQuestion();
        }
    }, 7000); 
}


// --- SOCKET.IO CONNECTION HANDLING ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- HOST EVENTS ---
    socket.on('hostConnect', () => {
        game.hostSocketId = socket.id;
        game.state = 'waiting';
        game.currentQuestionIndex = -1;
        game.players.clear();
        io.to(game.hostSocketId).emit('hostReady', { pin: GAME_PIN });
        console.log(`Host connected: ${socket.id}`);
        broadcastLeaderboard();
    });

    socket.on('hostStartGame', () => {
        if (socket.id === game.hostSocketId && game.state === 'waiting' && game.players.size > 0) {
            console.log('Host started game.');
            nextQuestion();
        } else if (game.players.size === 0) {
             io.to(game.hostSocketId).emit('error', 'Need at least one player to start.');
        }
    });

    socket.on('hostNextQuestion', () => {
        if (socket.id === game.hostSocketId && (game.state === 'score' || game.state === 'waiting')) {
            nextQuestion();
        }
    });

    // --- PLAYER EVENTS ---
    socket.on('playerJoin', ({ name, pin }) => {
        if (pin !== GAME_PIN || game.state !== 'waiting') {
            socket.emit('joinFailed', 'Invalid PIN or game already started.');
            return;
        }

        if (game.players.has(socket.id)) {
            socket.emit('joinFailed', 'You are already joined.');
            return;
        }

        // Add player to game state
        game.players.set(socket.id, {
            id: socket.id,
            name: name.substring(0, 15), // Truncate name
            score: 0,
            answered: false
        });

        socket.emit('joinSuccess', { name: name.substring(0, 15) });
        console.log(`Player joined: ${name} (${socket.id})`);
        
        // Notify host of new player and update player list
        broadcastLeaderboard(); 
    });

    socket.on('playerAnswer', (answer) => {
        const player = game.players.get(socket.id);
        const currentQ = questions[game.currentQuestionIndex];

        if (player && game.state === 'playing' && !player.answered && currentQ) {
            player.answered = true;
            game.answersReceived++;
            const timeTaken = Date.now() - game.currentQuestionStartTime;
            let pointsEarned = 0;

            if (answer === currentQ.correct) {
                // Calculate score based on speed (up to 33 points)
                const maxPoints = currentQ.points;
                const timeFactor = 1 - (timeTaken / QUESTION_TIME_LIMIT_MS);
                pointsEarned = Math.ceil(maxPoints * 0.5 + maxPoints * 0.5 * timeFactor); // Minimum 50% points for correct answer

                player.score += pointsEarned;
                socket.emit('answerFeedback', { correct: true, points: pointsEarned });
            } else {
                socket.emit('answerFeedback', { correct: false, points: 0 });
            }
            
            console.log(`${player.name} answered ${answer} (${pointsEarned} pts). Total answered: ${game.answersReceived}/${game.players.size}`);
            
            // Notify host of the number of answers received
            if (game.hostSocketId) {
                io.to(game.hostSocketId).emit('answersCountUpdate', game.answersReceived);
            }

            // If all players have answered, show results early
            if (game.answersReceived === game.players.size) {
                showQuestionResults();
            }
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (socket.id === game.hostSocketId) {
            game.hostSocketId = null;
            game.state = 'waiting';
            io.emit('hostDisconnected', 'The host has disconnected. Game reset.');
            console.log('Host disconnected. Game reset.');
        } else {
            game.players.delete(socket.id);
            broadcastLeaderboard();
            if (game.state === 'playing' && game.answersReceived > 0 && game.answersReceived === game.players.size) {
                // If the last remaining player left, check results
                showQuestionResults();
            }
        }
    });
});

// --- START SERVER ---

function startServer(port) {
    server.listen(port, () => {
        console.log(`\n======================================================`);
        console.log(`💜 Bible Quiz Server running on port ${port}`);
        console.log(`======================================================`);
        console.log(`\nTo play, open these URLs in your browser:`);
        console.log(`\n  Host Screen: http://localhost:${port}/host.html`);
        console.log(`  Player Device: http://localhost:${port}/player.html`);
        console.log(`\nGame PIN: ${GAME_PIN}`);
        console.log(`\n======================================================`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is busy. Trying port ${port + 1}...`);
            startServer(port + 1); // Try the next port
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(PORT);