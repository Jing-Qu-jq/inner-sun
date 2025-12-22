const API_KEY = 'your-api-key-here';
const ERROR_MESSAGE = 'Sorry, something went wrong while trying to connect to the assistant. Please try again in a moment.';
// Persistent message history
const chatHistory = [
    { role: 'system', content: 'You are a compassionate and culturally sensitive AI assistant trained to provide psychological support and wellness guidance to international students. Your responses should be empathetic, non-judgmental, and encouraging. Always consider the unique challenges faced by students living abroad, such as cultural adjustment, academic pressure, language barriers, and homesickness. Offer thoughtful advice, emotional validation, and practical coping strategies. Avoid diagnosing or giving medical advice, and instead focus on being a supportive listener and guide.' }
];

export default async function ConversationFetcher(question) {
    try {
        // Add the user's latest question
        chatHistory.push({role: 'user', content: question});

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: chatHistory
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            const reply = data.choices[0].message.content;
            // Add assistant's reply to the history
            chatHistory.push({role: 'assistant', content: reply});
            return reply;
        } else {
            console.error('No response from assistant.');
            return ERROR_MESSAGE;
        }

    } catch (error) {
        console.error('Error communicating with ChatGPT:', error.message);
        return ERROR_MESSAGE;
    }
}
