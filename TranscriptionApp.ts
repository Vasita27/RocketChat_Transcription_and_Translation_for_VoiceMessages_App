// Import Statements
import {
    IAppAccessors,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';

import {
    IPostMessageSent,
    IMessage,
} from '@rocket.chat/apps-engine/definition/messages';

import {
    IAppInfo,
} from '@rocket.chat/apps-engine/definition/metadata';

import {
    IUIKitInteractionHandler,
    UIKitBlockInteractionContext,
    IUIKitResponse,
} from '@rocket.chat/apps-engine/definition/uikit';

import {
    App,
} from '@rocket.chat/apps-engine/definition/App';

export class TranscriptionApp extends App implements IPostMessageSent, IUIKitInteractionHandler {
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
        if (!message.attachments || message.attachments.length === 0) return;

        for (const attachment of message.attachments) {
            const rawUrl = attachment.audioUrl;
            if (!rawUrl) continue;

            const fullAudioUrl = `http://localhost:3000${rawUrl}`;
            const block = modify.getCreator().getBlockBuilder();

            block.addSectionBlock({
                text: block.newMarkdownTextObject('*🎧 Audio Message Detected!* Click below to transcribe and translate.'),
            });

            block.addActionsBlock({
                elements: [
                    block.newButtonElement({
                        text: block.newPlainTextObject('Transcribe & Translate'),
                        actionId: 'select_language',
                        value: JSON.stringify({
                            audioUrl: fullAudioUrl,
                            originalMsgId: message.id,
                        }),
                    }),
                ],
            });

            await modify.getCreator().finish(
                modify.getCreator().startMessage()
                    .setRoom(message.room)
                    .setSender(message.sender)
                    .setBlocks(block)
            );
        }
    }

    public async executeBlockActionHandler(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<IUIKitResponse> {
        const data = context.getInteractionData();
        const user = data.user;
        const room = data.room;
        const actionId = data.actionId;
        const logger = this.getLogger();
    
        if (actionId === 'select_language') {
            const { audioUrl, originalMsgId } = JSON.parse(data.value || '{}');
            const block = modify.getCreator().getBlockBuilder();
    
            block.addSectionBlock({
                text: block.newMarkdownTextObject('🌍 *Choose the language you want to translate into:*'),
            });
    
            block.addActionsBlock({
                elements: ['es', 'fr', 'de', 'hi', 'ja'].map(lang =>
                    block.newButtonElement({
                        text: block.newPlainTextObject(lang.toUpperCase()),
                        actionId: 'transcribe_translate',
                        value: JSON.stringify({
                            audioUrl,
                            originalMsgId,
                            targetLanguage: lang
                        }),
                    })
                ),
            });
    
            await modify.getCreator().finish(
                modify.getCreator().startMessage()
                    .setRoom(room!)
                    .setSender(user)
                    .setBlocks(block)
            );
            
            // Send a success response to close the modal
            return context.getInteractionResponder().successResponse();
        }
    
        if (actionId === 'transcribe_translate') {
            const { audioUrl, originalMsgId, targetLanguage } = JSON.parse(data.value || '{}');
            this.handleTranscriptionAndReply(audioUrl, originalMsgId, user.id, room?.id ?? '', targetLanguage, read, http, modify, logger)
                .catch((error) => logger.error(`[executeBlockActionHandler] Error: ${error}`));
    
            // Respond with success once the action is completed
            return context.getInteractionResponder().successResponse();
        }
    
        return context.getInteractionResponder().successResponse();
    }
    

    private async handleTranscriptionAndReply(
        audioUrl: string,
        originalMsgId: string,
        userId: string,
        roomId: string,
        targetLanguage: string,
        read: IRead,
        http: IHttp,
        modify: IModify,
        logger: ILogger
    ): Promise<void> {
        let transcribedText: string | null = null;
        try {
            transcribedText = await this.transcribeAudioMessage(audioUrl, http, logger);
        } catch (e) {
            transcribedText = null;
        }

        if (!transcribedText) {
    const userObj = await read.getUserReader().getById(userId);
    const roomObj = await read.getRoomReader().getById(roomId);
    const appUser = await read.getUserReader().getAppUser();

    if (!userObj || !roomObj || !appUser) {
        this.getLogger().error(`Missing user, room, or app user: userId=${userId}, roomId=${roomId}`);
        return;
    }

    return modify.getNotifier().notifyUser(userObj, {
        sender: appUser,
        room: roomObj,
        text: '❌ Transcription failed.',
    });
}

        

        let translatedText: string | null = null;
        try {
            translatedText = await this.translateText(transcribedText, targetLanguage, http, logger);
        } catch (e) {
            translatedText = null;
        }

        const roomObj = await read.getRoomReader().getById(roomId);
        const userObj = await read.getUserReader().getById(userId);

        const textToSend = `*Transcription:* ${transcribedText}\n*Translation (${targetLanguage.toUpperCase()}):* ${translatedText ?? '❌ Translation failed.'}`;

        const builder = modify.getCreator().startMessage()
            .setRoom(roomObj!)
            .setSender(userObj!)
            .setText(textToSend)
            .setThreadId(originalMsgId);

        await modify.getCreator().finish(builder);
    }

    private async transcribeAudioMessage(audioUrl: string, http: IHttp, logger: ILogger): Promise<string | null> {
        try {
            const response = await http.post('http://deviceipadress:5005/transcribe', {
                headers: { 'Content-Type': 'application/json' },
                data: { audio_url: audioUrl },
            });
            return response.data.text ?? null;
        } catch (error) {
            logger.error(`[transcribeAudioMessage] ${error}`);
            return null;
        }
    }

    private async translateText(text: string, targetLanguage: string, http: IHttp, logger: ILogger): Promise<string | null> {
        try {
            const apiKey = "GEMINI_API_KEY"; // Replace with your actual API key
            const response = await http.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                headers: { "Content-Type": "application/json" },
                data: {
                    contents: [{
                        parts: [{
                            text: `Translate the following English sentence to ${targetLanguage}:\n\n"${text}". Return only the translated text.`
                        }]
                    }]
                }
            });
            return response.data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        } catch (error) {
            logger.error(`[translateText] ${error}`);
            return null;
        }
    }
}

