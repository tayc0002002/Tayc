const { clearTmpDirectory } = require("../../lib/myfunc2");
const fsp = require('fs/promises')


module.exports = [
    {
        command: ["menu"],
        desc: "Show all the commands of the bot",
        operate: async ({ sendText }) => {
            await sendText("Bonjour tu m'as tester")
        }
    },
    {
        command: ["cleartmp", "cleantmp", "clstmp"],
        desc: 'Clear temporary files',
        operate: async ({ reply, isOwner }) => {
            if (!isOwner) return reply('❌ You are not allowed to use this command!');
            const result = await clearTmpDirectory();
            reply(result.message);
        }
    },
    {
        command: ["chatbot"],
        desc: "Enable or disable the chatbot",
        operate: async ({ reply, args, Settings, settings }) => {
            try {
                if (!["on", "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "on" or "off".`)
                settings.chatbot = args[0]
                const newSettings = { ...Settings, settings }
                fsp.writeFile('./src/db/settings.json', JSON.stringify(newSettings, null, 2))
                if(args[0]==="off"){
                    fsp.writeFile('./src/db/chats.json', JSON.stringify({}, null, 2))
                }
                reply(`*✅ Chatbot ${args[0] === "on" ? "enabled" : "disabled"} successfully !*`);
            } catch (error) {
                console.error("Error in chatbot command:", error);
                reply("❌ An error occurred while processing your request.");
            }
        }
    }
]