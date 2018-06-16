import React from 'react';
import Brick from './Brick.jsx';
import Overlay from './Overlay.jsx';
import Timer from './Timer.jsx'
import axios from 'axios';

import io from 'socket.io-client';
const socket = io();

class Game extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      room: '',
      userInput: '',
      dictionary: {},
      words: [],
      theirWords: [],
      time: 0,
      timeInterval: 1000,
      modeInterval: 700,
      round: 'all',
      instructions: ["Humpty Dumpty sat on a wall,", "Humpty Dumpty had a great fall.", "All the king's horses and all the king's men", "Couldn't put Humpty together again.", "HURRY - KEEP TYPING TO PREVENT HIS DEMISE!"],
      prompt: ['SINGLE PLAYER', 'MULTI PLAYER'],
      mode: 'multi',
      difficulty: 'easy',
      opponentTime: 0,
      livePlayers: []
    }
    
    this.getReady = this.getReady.bind(this);
    this.startGame = this.startGame.bind(this);
    this.addWord = this.addWord.bind(this);
    this.updateOpponentWordList = this.updateOpponentWordList.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.sendScore = this.sendScore.bind(this);
    this.stopGame = this.stopGame.bind(this);
    this.handleMode = this.handleMode.bind(this);
    this.choosePlayersMode = this.choosePlayersMode.bind(this);
    this.enteringMultiPlayerLobby = this.enteringMultiPlayerLobby.bind(this);
    this.challenge = this.challenge.bind(this);
  

    socket.on('receive words from opponent', (words) => {
      this.updateOpponentWordList(words);
    });
    socket.on('startGame', (roomNum) => {
      this.setState({room: roomNum});
      this.startGame();
    });
    socket.on('they lost', (score) => {
      // this is bad, eventually put a red x over their bricks or something
      this.setState({
        opponentTime: score,
        instructions: ['GAME OVER', `YOU SCORED: ${this.state.time}`, `YOUR OPPONENT SCORED: ${score}`]
      })
      document.getElementById('their-game').style.backgroundColor = "red";
    });
    socket.on('player entered/left lobby', (data) => {
       if(data[socket.id]) delete data[socket.id];
       this.setState({
         livePlayers: data
       })
    })
    socket.on('getting challenged', (data) => {
      var accept = confirm(
        `${data.challenger.username} challenges you!
          Do you accept the challenge?`
      );
      if (accept === true) {
        data.response = true;
      } else {
        data.response = false;
      }
      socket.emit('challenge response', data)
    })
    socket.on('challenge denied', (opponent) => {
      alert(`${opponent} denied the challenge`);
    })

  }

  // get words from dictionary and join socket
  componentDidMount() {
    axios.get('/dictionary')
    .then(results => {
      this.setState({
        dictionary: results.data,
      })
    }).catch(err => {
      console.error(err);
    });
  }

  // sends your words to opponent
  componentDidUpdate(prevProps, prevState) {
    if (this.state.words.length !== prevState.words.length) {
      socket.emit('send words to opponent', {
        room: this.state.room,
        newWords: this.state.words,
      }); 
    }
  }

  handleMode(difficulty){
    this.setState({difficulty}, 
      () => {
        this.props.handleMode(difficulty)
        this.startGame();
      }
    )
  }

  enteringMultiPlayerLobby() {
    socket.emit('entering multi player lobby', this.props.username, () => {
      this.setState({
        prompt: "PLAY RANDOM OPPONENT"
      })
    });
  }

  choosePlayersMode(e) {
    e.preventDefault();
    console.log(e.target.innerHTML)
    if(e.target.innerHTML === "MULTI PLAYER") {
      this.setState({mode: 'multi', difficulty: 'medium'}, () => {
        this.props.handleMode('medium');
        this.enteringMultiPlayerLobby();
      })
    } else if (e.target.innerHTML === "PLAY RANDOM OPPONENT") {
      socket.emit('leaving multi player lobby', this.props.username);
      this.getReady();
    } else if (e.target.innerHTML === "SINGLE PLAYER") {
      this.setState({mode: 'single', prompt: "START GAME"});
    } else if (e.target.innerHTML === "START GAME") {
      this.startGame();
    } else if (e.target.innerHTML === "REPLAY") {
      if(this.state.mode === 'multi') {
        this.getReady();
      } else {
        this.startGame();
      }
    }
  }

  // challenge online player
  challenge(e) {
    var i = e.target.innerHTML.indexOf('<');
    var challengedUsername = e.target.innerHTML.substring(0, i);
    socket.emit('challenging user', {
      challenged: {username: challengedUsername, id: e.target.id},
      challenger: {username: this.props.username, id: socket.id}
    });
  }


  // hides starter form and user input, waits for another player tso start game
  getReady() {
    document.getElementById('starter-form').disabled = true;
    document.getElementById('user-input').disabled = true;
    this.setState({
      prompt: 'WAITING...',
    });
    
    // requesting a room for random multiplayer matches and entering that room.
    socket.emit('entering room', this.props.username) /*, ((data) => {
      this.setState({
        room: data
      })*/
    //   socket.emit('ready', {
    //     room: this.state.room, 
    //     username: this.props.username
    //   });
    //}));
  }

  startGame() {
    document.getElementById('typing-input').disabled = false;
    document.getElementById('typing-input').focus();
    document.getElementById('overlay').style.display = "none";
    document.getElementById('their-game').style.backgroundColor = "transparent";
    document.getElementById('gudetama').style = {
      display: "inline-block",
      backgroundColor: "none",
    };
    document.getElementById('their-gudetama').style = {
      display: "inline-block",
      backgroundColor: "none",
    };

    //changing display based on one or two players
    if(this.state.mode === 'single') {
      document.getElementById('their-game').style.display = "none";
    } else if (this.state.mode === 'multi') {
      document.getElementById('their-game').style.display = "flex";
    }

    // long function to define what happens at every interval
    var go = () => {
      // creates a loop by calling itself:
      var step = setTimeout(() => {
        go();
      }, this.state.timeInterval);

      // adds a brick:
      this.addWord();

      // ends game or changes background color of gudetama based on length of "words" array
      // (as bricks build up, background turns a darker red to signify danger)
      if (this.state.words.length >= 20) {
        clearTimeout(step);
        //console.log('opponent time',this.state.time)
        socket.emit('i lost', {
          room: this.state.room, 
          username: this.props.username, 
          score: this.state.time
        });
        this.stopGame();
        return;
      } else if (this.state.words.length > 15) {
        document.getElementById('gudetama').style.backgroundColor = "rgba(255, 0, 0, 1)";
      } else if (this.state.words.length > 10) {
        document.getElementById('gudetama').style.backgroundColor = "rgba(255, 0, 0, 0.5)";
      }

      // updates the time and speeds up the game accordingly 
      // (as timeInterval decreases, words appear at a faster rate)
      var newTime = this.state.time + 1;
      if(this.state.difficulty === 'easy') {
        this.setState({round: 'roundOne'})
      }
      if(this.state.difficulty === 'medium') {
        this.setState({round: 'roundTwo'})
      }
      if(this.state.difficulty === 'hard') {
        this.setState({round: 'roundThree'})
      }
      if (newTime > 20) {
        this.setState({
          time: newTime,
          timeInterval: this.state.modeInterval,
          // round: 'roundThree' // uncomment these to only serve short words at beginning, long words at end
        });
      } else if (newTime > 8) { 
        this.setState({
          time: newTime,
          timeInterval: this.state.modeInterval,
          // round: 'roundOne'
        });
      } else {
        this.setState({
          time: newTime,
          // round: 'roundOne',
        });
      }
    }

    // blank slate, then start!
    this.setState({
      words: [],
      time: 0,
      timeInterval: 1000,
      userInput: '',
    }, () => go());
  
  }

  // pulls random word from dictionary obj and adds it to words state
  addWord() {
    var availableWords = this.state.dictionary[this.state.round];
    var newWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    this.setState({
      words: [...this.state.words, newWord]
    });
  }

  // updates your view of opponent's words
  updateOpponentWordList(words) {
    this.setState({
      theirWords: words
    })
  }

  // updates userInput with what user is currently typing
  handleChange(e) {
    this.setState({
      userInput: e.target.value,
    })
  }

  // when the user hits "enter"
  handleSubmit(e) {
    e.preventDefault();
    var submittedWord = this.state.userInput;
    var index = this.state.words.indexOf(submittedWord);
    
    // check if what they typed is in our "words" array
    // flash green for a correctly typed word and remove word from "words" array
    if (index !== -1) {
      document.getElementById('typing-input').style.backgroundColor = "green";
      var newWords = this.state.words.slice();
      newWords.splice(index, 1);
      playCorrect(); 
      this.setState({
        words: newWords,
      });
    } else {
      // else flash red for a mistyped word
      playWrong(); 
      document.getElementById('typing-input').style.backgroundColor = "red";
    }

    setTimeout(() => {
      document.getElementById('typing-input').style.backgroundColor = "white";
    }, 100);

    this.setState({
      userInput: '',
    });
  }

  // upon game over, sends username and score to database to be added/updated
  sendScore(username, score, difficulty) {
    axios.post('/wordgame', {
      "username": username,
      "high_score": score,
      "mode": difficulty
    })
    .then(result => {
      this.props.updateScoreboard()
      console.log(result);
    }).catch(err => {
      console.error(err);
    })
  }

  stopGame() {
    document.getElementById('typing-input').disabled = true;
    document.getElementById('overlay').style.display = "block";
    document.getElementById('gudetama').style.display = "none";
    document.getElementById('their-gudetama').style.display = "none";
    document.getElementById('starter-form').disabled = false;
    document.getElementById('user-input').disabled = false;

    // enables user to hit "enter" after 2 seconds to restart game
    setTimeout(() => {
      if (document.getElementById('overlay').display !== "none") {
        document.getElementById('user-input').focus();
      }
    }, 2000);
    
    this.sendScore(this.props.username, this.state.time);
 
    // audio effect
    playGameOver();
    
    if(this.state.mode === "multi") {
      var instr = ['GAME OVER', `YOU SCORED: ${this.state.time}`, `YOUR OPPONENT SCORED: ${this.state.opponentTime}`]
    } else {
      var instr = ['GAME OVER', `YOU SCORED: ${this.state.time}`]
    }
    console.log({instr});
    this.setState({
      // maybe find a way to compare your score vs opponent's score and show YOU WIN/YOU LOSE
      instructions: instr,
      prompt: 'REPLAY'
    });
  }

  render() {
    return (
      <div className="game">
        <Overlay
          instructions={this.state.instructions}
          prompt={this.state.prompt}
          choosePlayersMode={this.choosePlayersMode}
          username={this.props.username}
          handleUserNameChange={this.props.handleUserNameChange}
          livePlayers={this.state.livePlayers}
          challenge={this.challenge}
          handleMode = {this.handleMode}
        />
    
      <Timer time = {this.state.time}/>

        <div className="board">
          {/* your game: */}
          <div className="play"> 
            {this.state.words.map((word, index) => {
              return <Brick word={word} key={index} />
            })}
            <div id="gudetama"></div>
            <form onSubmit={this.handleSubmit} autoComplete="off">
              <input id="typing-input" value={this.state.userInput} onChange={this.handleChange} />
            </form>
          </div>

          {/* their game: */}
          <div className="play" id="their-game"> 
            {this.state.theirWords.map((word, index) => {
              return <Brick word={word} key={index} />
            })}
            <div id="their-gudetama"></div>
            <form autoComplete="off">
              <input value="OPPONENT" />
            </form>
          </div>
        </div>
      </div>
    )
  }
}

export default Game;