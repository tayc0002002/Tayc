const { clearTmpDirectory } = require("../../lib/myfunc2");

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
    }
]