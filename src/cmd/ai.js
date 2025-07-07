const axios = require("axios");
const fetch = require('node-fetch');

module.exports = [
    {
        command: ["gpt"],
        desc: "Ask question to ChatGpt.",
        operate: async ({ text: query, reply, react }) => {

            if (!query) {
                react('❌')
                return reply(`❌ Please provide a question for ChatGPT.`)
            }
            react("🛜")
            try {
                const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`);

                if (response.data && response.data.success && response.data.result) {
                    const answer = response.data.result.prompt;
                    reply(answer)
                    react("")
                } else {
                    throw new Error('Invalid response from API');
                }
            } catch (e) {
                console.error("Error in GPT command:", e);
                return reply("❌ An error occurred while processing your request.");
            }
        }
    },
    {
        command: ["gemini"],
        desc: "Ask question to Gemini.",
        operate: async ({ text: query, reply, react }) => {

            if (!query) {
                react('❌')
                return reply(`❌ Please provide a question for ChatGPT.`)
            }
            const apis = [
                `https://vapis.my.id/api/gemini?q=${encodeURIComponent(query)}`,
                `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(query)}`,
                `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(query)}`,
                `https://api.dreaded.site/api/gemini2?text=${encodeURIComponent(query)}`,
                `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(query)}`,
                `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(query)}`
            ];
            react("🛜")
            try {
                for (const api of apis) {
                    try {
                        const response = await fetch(api);
                        const data = await response.json();

                        if (data.message || data.data || data.answer || data.result) {
                            const answer = data.message || data.data || data.answer || data.result;
                            reply(answer);
                            return;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                throw new Error('All Gemini APIs failed');
            } catch (e) {
                console.error("Error in GPT command:", e);
                return reply("❌ An error occurred while processing your request.");
            }

        }
    }
]