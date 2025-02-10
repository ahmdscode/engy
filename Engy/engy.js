// node engy.js
// node --no-warnings engy.js
// 7713856188:AAH8QeHJOsecSLFC5G6PUyPMt-VXM8MkN_c

// npm install node-schedule / if node-cron won't work
// npm install telegraf / if node-telegram-bot-api won't work

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const tmp = require('tmp');
const path = require('path');
const gTTS = require('gtts');
const cron = require('node-cron');
const phrases = require('./phrases.json'); 
const randomWords = require('./randomwords.json');
const { translate } = require('google-translate-api-x');

// Replace with your bot's token
const token = '7517323021:AAHmlF-88WkpGdbFnBom2p3gPOQ69WThVK4';
const bot = new TelegramBot(token, { polling: true });

// Path to the users data file
const usersDataPath = path.join(__dirname, 'users.json');

const loadUsers = () => {
    if (fs.existsSync(usersDataPath)) {
      try {
        const data = fs.readFileSync(usersDataPath, 'utf-8');
        
        // Check if the file is empty or not valid JSON
        if (!data) {
          console.log('User data file is empty, initializing with an empty object.');
          return {}; // Return an empty object if file is empty
        }
  
        return JSON.parse(data); // Parse the JSON data
      } catch (error) {
        console.error('Error loading user data from file:', error);
        return {}; // Return an empty object in case of error
      }
    } else {
      return {}; // If the file doesn't exist, return an empty object
    }
  };
  
  // Function to save users to the file
  const saveUsers = (users) => {
    fs.writeFileSync(usersDataPath, JSON.stringify(users, null, 2), 'utf-8');
  };

// Store user settings
let users = loadUsers();

// Function to send the daily phrase with dynamically generated audio
const sendDailyPhrase = (chatId) => {
  const user = users[chatId];

  // Initialize sentPhrases array if not already initialized
  if (!user.sentPhrases) {
    user.sentPhrases = [];
  }

  // Check if all phrases have been sent, reset if so
  if (user.sentPhrases.length === phrases.length) {
    user.sentPhrases = [];
  }

  // Pick a random phrase that hasn't been sent yet
  let phrase;
  while (true) {
    const randomIndex = Math.floor(Math.random() * phrases.length);
    phrase = phrases[randomIndex];

    // Ensure the phrase hasn't been sent yet
    if (!user.sentPhrases.includes(randomIndex)) {
      user.sentPhrases.push(randomIndex); // Mark this phrase as sent
      break;
    }
  }

  // Send the phrase text
  bot.sendMessage(chatId, `${phrase.description}\n\nEnglish:\n${phrase.en}\n\nRussian:\n${phrase.ru}`);

  // Clean the English text for audio (remove speaker labels and newlines)
  const cleanText = phrase.en
    .replace(/(^|\n)[A-Z]:/g, '') // Remove "A:" or "B:" at the beginning of lines
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim(); // Remove leading/trailing spaces

  const gtts = new gTTS(cleanText, 'en-us');
  
  // Create a temporary file
  const tempFile = tmp.fileSync({ postfix: '.mp3' });
  
  // Save the audio to the temporary file
  gtts.save(tempFile.name, (err) => {
    if (err) {
      console.error('Error generating audio:', err);
      return;
    }
  
    // Send the audio file to the user
    bot.sendAudio(chatId, tempFile.name, {
      performer: 'Engy',
      title: 'Pronunciation',
    }).then(() => {
      // Clean up the temporary file after sending
      tempFile.removeCallback();
    }).catch((error) => {
      console.error('Error sending audio:', error);
      tempFile.removeCallback(); // Clean up in case of error
    });
  });

  // Save the updated users data
  saveUsers(users);
};

bot.once('message', (message) => {
  const time = message.text;
  
  if (!time || time.trim() === '') {
    bot.sendMessage(message.chat.id, 'You didn’t provide a time. Please try again.');
    return;  // Exit to prevent sending an empty message
  }

  saveUserData(message.chat.id, time);
  bot.sendMessage(message.chat.id, `Your preferred time has been set to ${time}.`);
});


// Handle the /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Capture user details
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || ""; // Last name is optional
    const username = msg.from.username || "";  // Username is optional

    // Store user details along with their preferences
    users[chatId] = {
        stage: 'waiting_for_time',
        currentIndex: 0,
        timeSet: false,
        time: "",
        firstName: firstName,  // Store first name
        lastName: lastName,    // Store last name (if available)
        username: username     // Store username (if available)
    };

    bot.sendMessage(chatId, "Отлично! Вы решили начать обучение.");
    bot.sendMessage(chatId, "Укажите время, когда вы хотите получать ежедневный диалог, между 00:00 и 23:59, например, в 09:00.");
});

// Handle the /time command
bot.onText(/\/time/, (msg) => {
  const chatId = msg.chat.id;
  if (users[chatId]) {
    users[chatId].stage = 'waiting_for_new_time';
    bot.sendMessage(chatId, "Укажите новое время между 00:00 и 23:59, например, в 12:00.");
    saveUsers(users); // Save the updated user data to file
  } else {
    bot.sendMessage(chatId, "");
  }
});

const message = 'Your message here';

if (message && message.trim() !== '') {
  bot.sendMessage(userId, message);
} else {
  console.log('Message is empty, not sending.');
}


// Handle user input for time setting
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId];

  // Save the message text
    if (user) {
    // Initialize messages array if it doesn't exist
    if (!user.messages) {
      user.messages = [];
    }

    // Add the message to the user's messages array
    user.messages.push(msg.text);

    // Save updated users data to the file
    saveUsers(users);
  }

  // Time format validation
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  if (user && user.stage === 'waiting_for_time') {
    if (timeRegex.test(msg.text)) {
      const [hour, minute] = msg.text.split(':').map(Number);
      users[chatId].time = `${minute} ${hour} * * *`; // Store time in cron format
      bot.sendMessage(chatId, `Отлично! Я буду отправлять вам ежедневный диалог в ${msg.text}.`);
      users[chatId].timeSet = true; // Mark time as set
      users[chatId].stage = null; // Reset stage after time is set

      // Save the updated user data to file
      saveUsers(users);

      // Send the follow-up message with audio after 2 seconds (right after time is set)
      setTimeout(() => {
        const firstLook = "Разговор о начале изучения английского языка (Пример)";
        const firstPhraseEn = `A: I'm starting to learn English.\nB: That's awesome! How's it going so far?\nA: It's a bit challenging, but I'm motivated to get better.\nB: That's great! Just keep going, and you'll see the progress.`; // English dialogue
        const firstPhraseRu = `A: Я начинаю учить английский.\nB: Это здорово! Как у тебя получается?\nA: Это немного сложно, но я мотивирован стать лучше.\nB: Отлично! Просто продолжай, и ты увидишь прогресс.`; // Russian translation

        // Prepare the message format
        const fullMessage = `${firstLook}\n\nEnglish:\n${firstPhraseEn}\n\nRussian:\n${firstPhraseRu}`;
        bot.sendMessage(chatId, fullMessage); // Send the message with description, English, and Russian texts

        // Prepare clean English text for audio (remove speaker labels like "A:" and "B:")
        const cleanText = firstPhraseEn
          .replace(/(^|\n)[A-Z]:\s/g, '') // Remove "A:" and "B:" with spaces after them
          .replace(/\n/g, ' ') // Replace newlines with spaces
          .trim(); // Remove leading/trailing spaces

        // Dynamically generate audio for the cleaned English text
        const gtts = new gTTS(cleanText, 'en-us'); // Generate audio for the cleaned English text
        const stream = gtts.stream();

        bot.sendAudio(chatId, stream, { performer: 'Engy', title: 'Pronunciation' }, { filename: 'Pronunciation', contentType: 'audio/mpeg' })
        .catch((error) => {
          console.error('Error sending audio:', error);
        });
      }, 2000); // 2000 ms = 2 seconds
    } else {
      bot.sendMessage(chatId, "Пожалуйста, выберите корректное время между 00:00 и 23:59, например, в 09:00.");
    }
  }

  // If the user already chose a time and the message is not a command like /start.
    if (user && !user.stage && !msg.text.startsWith('/')) {
    setTimeout(() => {
      bot.sendMessage(chatId, "Чтобы посмотреть команды бота, нажмите ☰.");
    }, 1000); // 1000 ms = 1 second delay
  }

  // If the user is changing the time
  if (user && user.stage === 'waiting_for_new_time') {
    if (timeRegex.test(msg.text)) {
      const [hour, minute] = msg.text.split(':').map(Number);
      users[chatId].time = `${minute} ${hour} * * *`; // Update cron time
      bot.sendMessage(chatId, `Ваш ежедневный диалог теперь будет отправляться в ${msg.text}.`);
      users[chatId].stage = null; // Reset stage after time change
      saveUsers(users); // Save the updated user data to file
    } else {
      bot.sendMessage(chatId, "Пожалуйста, выберите корректное время между 00:00 и 23:59, например, в 09:00.");
    }
  }
});

bot.onText(/\/word/, (msg) => {
  const chatId = msg.chat.id;

  // Initialize the sentWords array if not already initialized
  if (!users[chatId].sentWords) {
    users[chatId].sentWords = [];
  }

  // Select an unused word
  let wordToSend;
  if (users[chatId].sentWords.length === randomWords.length) {
    // All words have been sent, reset the sentWords array
    users[chatId].sentWords = [];
  }

  // Pick a random word that hasn't been sent yet
  while (true) {
    const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];
    if (!users[chatId].sentWords.includes(randomWord.en)) {
      wordToSend = randomWord;
      users[chatId].sentWords.push(randomWord.en); // Mark word as sent
      break;
    }
  }

  // Prepare the message text (without audio)
  const messageText = `Word:\n\nEnglish: ${wordToSend.en}\nRussian: ${wordToSend.ru}\n\nMeaning (English): ${wordToSend.meaning_en}\nMeaning (Russian): ${wordToSend.meaning_ru}`;

  // Send the text message first
  bot.sendMessage(chatId, messageText);

  // Function to generate and send audio for text
  const sendAudio = (chatId, text, audioTitle) => {
    const gtts = new gTTS(text, 'en-us'); // Set language to English
    const tempFile = tmp.fileSync({ postfix: '.mp3' });

    gtts.save(tempFile.name, (err) => {
      if (err) {
        console.error('Error generating audio:', err);
        return;
      }

      // Send the audio to the user
      bot.sendAudio(chatId, tempFile.name, {
        performer: 'Engy',
        title: audioTitle,
      }).then(() => {
        // Clean up the temporary file after sending
        tempFile.removeCallback();
      }).catch((error) => {
        console.error('Error sending audio:', error);
        tempFile.removeCallback(); // Clean up in case of error
      });
    });
  };

  // Generate and send audio for the word and the definition
  sendAudio(chatId, wordToSend.en, `Pronunciation of the word: ${wordToSend.en}`);
  sendAudio(chatId, wordToSend.meaning_en, `Pronunciation of the meaning: ${wordToSend.meaning_en}`);

  // Save the updated users data
  saveUsers(users);
});

























// Define the maximum number of characters allowed for translation
const MAX_CHARACTERS = 300; // Set your desired character limit here

// Handle /translate command
bot.onText(/\/translate/, (msg) => {
  const chatId = msg.chat.id;

  // Inform the user to send text for translation
  bot.sendMessage(chatId, "Please send the text you'd like to translate (limit: 300 characters).");
  
  // Change the stage to waiting for input text
  users[chatId].stage = 'waiting_for_translate_text';
  saveUsers(users);
});

// Handle user input for translation
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId];

  // Only process if the user is in the 'waiting_for_translate_text' stage
  if (user && user.stage === 'waiting_for_translate_text') {
    const textToTranslate = msg.text;

    // Check if the length of the input text exceeds the character limit
    const textLength = textToTranslate.length;

    if (textLength > MAX_CHARACTERS) {
      bot.sendMessage(chatId, `Sorry, your text exceeds the character limit of ${MAX_CHARACTERS} characters. Please shorten your message.`);
      return; // Exit early if the character limit is exceeded
    }

    try {
      // Translate the text to both languages (Russian and English)
      const resultEnToRu = await translate(textToTranslate, { to: 'ru' }); // Translate to Russian
      const resultRuToEn = await translate(textToTranslate, { to: 'en' }); // Translate to English

      // Send both translations back to the user
      bot.sendMessage(chatId, `Translation to English: ${resultRuToEn.text}`);
      bot.sendMessage(chatId, `Translation to Russian: ${resultEnToRu.text}`);

      // Function to generate and send audio for translated text
      const sendAudio = (chatId, text, language, title) => {
        const gtts = new gTTS(text, language); // Set language for translation
        const tempFile = tmp.fileSync({ postfix: '.mp3' });

        gtts.save(tempFile.name, (err) => {
          if (err) {
            console.error('Error generating audio:', err);
            return;
          }

          // Send the audio to the user
          bot.sendAudio(chatId, tempFile.name, {
            performer: 'Engy',
            title: title,
          }).then(() => {
            // Clean up the temporary file after sending
            tempFile.removeCallback();
          }).catch((error) => {
            console.error('Error sending audio:', error);
            tempFile.removeCallback(); // Clean up in case of error
          });
        });
      };

      // Generate and send audio for the Russian translation
      // sendAudio(chatId, resultEnToRu.text, 'ru', `Pronunciation of the Russian translation`);

      // Generate and send audio for the English translation
      sendAudio(chatId, resultRuToEn.text, 'en', `Pronunciation of the Translation`);

      // Reset the stage
      users[chatId].stage = null;
      saveUsers(users);
    } catch (error) {
      console.error('Translation error:', error);
      bot.sendMessage(chatId, "Sorry, I couldn't translate that. Please try again.");
    }
  }
});































bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "THIS BOT IS\n\nVERY COOL");
});

bot.onText(/\/support/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "bank account:\n\nBank Card: 1234 5678 9876 5432");
});

bot.onText(/\/feedback/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "feedbackhere");
});

// Schedule daily messages based on user-selected time
cron.schedule('* * * * *', () => {
  const currentHour = new Date().getHours();
  const currentMinute = new Date().getMinutes();

  for (const chatId in users) {
    if (users[chatId].time === `${currentMinute} ${currentHour} * * *`) {
      if (users[chatId].timeSet) {
        sendDailyPhrase(chatId); // Send phrase only if the time is set
      }
    }
  }
});

console.log('Bot is running...');
