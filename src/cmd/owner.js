const { command } = require("yargs");
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
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["on", "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "on" or "off".`)
                settings.chatbot = args[0]
                saveNewSetting({ ...Settings, settings })
                if (args[0] === "off") fsp.writeFile('./src/db/chats.json', JSON.stringify({}, null, 2))

                reply(`*✅ Chatbot ${args[0] === "on" ? "enabled" : "disabled"} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["autorecordtype","art"],
        desc: "Set the simulation of typing or recording",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["all", "group", "private", 'pm', "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "all", "group", "private", or "pm".`)
                settings.autorecordtype = args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Autorecord type  ${args[0] === "off" ? "disabled" :"set to "+ args[0]} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["autoread"],
        desc: "Set the autoread mode",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["all", "group", "private", "pm"].includes(args[0])) return reply(`❌ Invalid argument. Please use "all", "group", "private", or "pm".`)
                settings.autoread = args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Autoread mode set to ${args[0]} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["lang", "setlang"],
        desc: "Set the language of the bot",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["en", "fr"].includes(args[0])) return reply(`❌ Invalid argument. Please use "en" or "fr".`)
                settings.lang = args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Language set to ${args[0]} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["prefix", "setprefix"],
        desc: "Set the prefix of the bot",
        operate: async ({ reply, text, Settings, settings, cmd, saveNewSetting }) => {
            try {
                if (!text || text.length !== 1) return reply(`❌ Invalid usage. \n> ${cmd} <new_prefix>`)
                settings.prefix = text
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Prefix set to "${text}" successfully !*`);
            } catch (e) { console.log(e) }
        }
    },
    {
        command: ["mode"],
        desc: "Set the mode of the bot",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["private", "public"].includes(args[0])) return reply(`❌ Invalid argument. Please use "private" or "public".`)
                settings.mode = args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Mode set to ${args[0]} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["statusemojis", "setstatusemojis", "sse"],
        desc: "Set the emojis to react to statuses (comma-separated)",
        operate: async ({ reply, text, Settings, settings, saveNewSetting }) => {
            try {
                if (!text) {
                    return reply(`❌ Please provide emojis separated by commas.\n\nExample:\n*statusemojis 😂,🔥,💯*`);
                }

                // Extraire chaque élément séparé par virgule
                const rawItems = text.split(",").map(e => e.trim());
                const validEmojis = rawItems.filter(e => e.match(/^\p{Emoji}+$/u));

                if (validEmojis.length === 0) {
                    return reply(`❌ No valid emojis found.\nMake sure you only include emojis, like:\n*statusemojis 😁,🔥,🤖*`);
                }
                if (validEmojis.length < rawItems.length) {
                    return reply(`⚠️ Some entries were not valid emojis and were ignored.\n\nValid emojis used:\n${validEmojis.join(" ")}`);
                }
                settings.statusemojis = validEmojis.join(",");
                await saveNewSetting({ ...Settings, settings });

                reply(`✅ *Status emojis set successfully!*\n\n${validEmojis.map(e => `• ${e}`).join("\n")}`);
            } catch (err) {
                console.error("❌ Error in statusemojis command:", err);
                reply("❌ An error occurred while saving the emojis.");
            }
        }
    },
    {
        command: ["autoreactstatus", "areacs"],
        desc: "Enable or disable automatic reactions to statuses",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["on", "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "on" or "off".`)
                settings.autoreactstatus = args[0] === "on"
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Autoreact status ${args[0] === "on" ? "enabled" : "disabled"} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["autoreplystatus", "ars"],
        desc: "Enable or disable automatic replies to statuses",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["on", "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "on" or "off".`)
                settings.autoreplystatus = args[0] === "on"
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Autoreply status ${args[0] === "on" ? "enabled" : "disabled"} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["autoviewstatus", "avs"],
        desc: "Enable or disable automatic viewing of statuses",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["on", "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "on" or "off".`)
                settings.autoviewstatus = args[0] === "on"
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Autoview status ${args[0] === "on" ? "enabled" : "disabled"} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["autowritecontact", "awc"],
        desc: "Enable or disable automatic writing when receive contact",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["on", "off"].includes(args[0])) return reply(`❌ Invalid argument. Please use "on" or "off".`)
                settings.awc = args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Autowrite contact status ${args[0] === "on" ? "enabled" : "disabled"} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["antidelete"],
        desc: "Set antidelete mode",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["off", "pm", "private", "chat"].includes(args[0])) return reply(`❌ Invalid argument. Please use *"private","chat","pm" or "off"*.`)
                settings.antidelete = args[0] === "pm" ? "private" : args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Antidelete ${args[0] === "off" ? "disabled" : "set to " + settings.antidelete} successfully !*`);
            } catch { }
        }
    },
    {
        command: ["antiedite"],
        desc: "Set antiedite mode",
        operate: async ({ reply, args, Settings, settings, saveNewSetting }) => {
            try {
                if (!["off", "pm", "private", "chat"].includes(args[0])) return reply(`❌ Invalid argument. Please use *"private","chat","pm" or "off"*.`)
                settings.antiedite = args[0] === "pm" ? "private" : args[0]
                saveNewSetting({ ...Settings, settings })
                reply(`*✅ Antiedite ${args[0] === "off" ? "disabled" : "set to " + settings.antiedite} successfully !*`);
            } catch { }
        }
    },




]