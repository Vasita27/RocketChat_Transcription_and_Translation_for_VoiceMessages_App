import { App } from '@rocket.chat/apps-engine/definition/App';
import { ILogger, IAppAccessors, IHttp, IModify, IRead, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';
import { IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';


export class TranscriptionApp extends App implements IPostMessageSent {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        const logger = this.getLogger();

        if (!message.attachments || message.attachments.length === 0) {
            return;
        }

        for (const attachment of message.attachments) {
            const rawUrl = attachment.audioUrl;

            if (!rawUrl) {
                continue;
            }

            const fullAudioUrl = `http://localhost:3000${rawUrl}`;

            let transcribedText: string | null = null;
            try {
                transcribedText = await this.transcribeAudioMessage(fullAudioUrl, http, logger);
            } catch (e) {
                logger.error(`Transcription error: ${e}`);
                continue;
            }

            if (!transcribedText) {
                continue;
            }

            let translatedText: string | null = null;
            try {
                translatedText = await this.translateText(transcribedText, 'es', http, logger);
            } catch (e) {
                logger.error(`❌ Translation failed: ${e}`);
            }

            // Create and send a reply in the thread
            const textToSend = ` *Transcription:* ${transcribedText}${translatedText ? `\n *Translation (ES):* ${translatedText}` : ''}`;

            const builder = modify.getCreator().startMessage()
                .setText(textToSend)
                .setRoom(message.room)
                .setSender(message.sender);

            if (message.id) {
                builder.setThreadId(message.id);
            }

            await modify.getCreator().finish(builder);
        }
    }

    private async transcribeAudioMessage(audioUrl: string, http: IHttp, logger: ILogger): Promise<string | null> {
        //you can get the device ip adress using ipconfig command in command prompt
        const response = await http.post('http://deviceipadress:5005/transcribe', {
            headers: {
                'Content-Type': 'application/json',
            },
            data: { audio_url: audioUrl },
        });

        

        if (response.statusCode !== 200 || !response.data || !response.data.text) {
            throw new Error(`Transcription API Error: ${JSON.stringify(response.data)}`);
        }

        return response.data.text;
    }

    private async translateText(text: string, targetLanguage: string, http: IHttp, logger: ILogger): Promise<string | null> {
        const geminiPayload = {
            contents: [
                {
                    parts: [
                        {
                            text: `Translate the following English sentence to ${targetLanguage}:\n\n"${text}". Return only the translated text.`
                        }
                    ]
                }
            ]
        };
        //For prototype purpose, since Gemini API is free, I have used it. In real time, paid services like Google Translate's API will be used.
        const apiKey = "your_api_key_here" //Only for testing locally. For deployment store the API key securely in admin panel settings
        const response = await http.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            headers: {
                "Content-Type": "application/json",
            },
            data: geminiPayload
        });
      
        if (response.statusCode !== 200) {
            throw new Error('Gemini translation failed');
        }

        return response.data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }
}
