module.exports = [
    {
        command: ["repeat", "rpt"],
        desc: "Multiply the message",
        operate: async ({ Tayc, reply, text, mess, cmd }) => {
            try {
                const [msg, count] = text.split("$$")
                if (!msg || !count) return reply(`❌ *Invalid usage*\n\nUsage: ${cmd} <message>$$<count>`)
                if (isNaN(count) || count <= 0) return reply(`❌ *Invalid count*\n\nCount must be a positive number.`)
                const response = msg.concat("_)))_").repeat(Number(count)).replace(/_\)\)\)_/g, '\n')
                reply(response)
            } catch {
                reply(mess.error)
            }
        }
    }

]