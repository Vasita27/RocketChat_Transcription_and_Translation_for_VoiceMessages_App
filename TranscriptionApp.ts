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

            const block = modify.getCreator().getBlockBuilder();

            block.addSectionBlock({
                text: block.newMarkdownTextObject('*🎧 Audio Message Detected!* Click below to transcribe and translate.'),
            });

            block.addActionsBlock({
                elements: [
                    block.newButtonElement({
                        text: block.newPlainTextObject('Transcribe & Translate'),
                        actionId: 'transcribe_translate',
                        value: JSON.stringify({
                            audioUrl: fullAudioUrl,
                            originalMsgId: message.id,
                        }),
                    }),
                ],
            });

            try {
                await modify.getCreator().finish(
                    modify.getCreator().startMessage()
                        .setRoom(message.room)
                        .setSender(message.sender)
                        .setBlocks(block)
                );
            } catch (error) {
                logger.error('Error sending initial transcription button message:', error);
            }
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
    
        const { audioUrl, originalMsgId } = JSON.parse(data.value || '{}');
        const logger = this.getLogger();
    
        logger.debug(`[executeBlockActionHandler] Started for user ${user.id} in room ${room?.id} with audioUrl: ${audioUrl}, originalMsgId: ${originalMsgId}`);
    
        // Fire and forget
        this.handleTranscriptionAndReply(audioUrl, originalMsgId, user.id, room?.id ?? '', read, http, modify, logger)
            .then(() => logger.debug(`[executeBlockActionHandler] Async work done.`))
            .catch((error) => logger.error(`[executeBlockActionHandler] Error in async work: ${error}`));
    
        // Return success response right away to avoid timeout
        return context.getInteractionResponder().successResponse();
    }
    
    private async handleTranscriptionAndReply(
        audioUrl: string,
        originalMsgId: string,
        userId: string,
        roomId: string,
        read: IRead,
        http: IHttp,
        modify: IModify,
        logger: ILogger
    ): Promise<void> {
        let transcribedText: string | null = null;
        logger.debug(`[handleTranscriptionAndReply] Starting transcription for ${audioUrl}`);
        try {
            transcribedText = await this.transcribeAudioMessage(audioUrl, http, logger);
            logger.debug(`[handleTranscriptionAndReply] Transcription successful: ${transcribedText}`);
        } catch (e) {
            logger.error(`[handleTranscriptionAndReply] Transcription error: ${e}`);
            transcribedText = '❌ Transcription failed.';
        }

        let translatedText: string | null = null;
        logger.debug(`[handleTranscriptionAndReply] Starting translation for "${transcribedText}"`);
        try {
            translatedText = await this.translateText(transcribedText!, 'es', http, logger);
            logger.debug(`[handleTranscriptionAndReply] Translation successful: ${translatedText}`);
        } catch (e) {
            logger.error(`[handleTranscriptionAndReply] Translation failed: ${e}`);
        }

        const textToSend = `*Transcription:* ${transcribedText}${translatedText ? `\n*Translation (ES):* ${translatedText}` : ''}`;

        logger.debug(`[handleTranscriptionAndReply] Sending reply: ${textToSend}`);
        try {
            const roomObj = await read.getRoomReader().getById(roomId);
            if (!roomObj) {
                throw new Error(`Room with ID ${roomId} not found`);
            }
            const userObj = await read.getUserReader().getById(userId);
            if (!userObj) {
                throw new Error(`User with ID ${userId} not found`);
            }

            const builder = modify.getCreator().startMessage()
                .setRoom(roomObj)
                .setSender(userObj)
                .setText(textToSend)
                .setThreadId(originalMsgId);

            await modify.getCreator().finish(builder);
            logger.debug(`[handleTranscriptionAndReply] Reply sent successfully.`);
        } catch (error) {
            logger.error(`[handleTranscriptionAndReply] Error sending reply: ${error}`);
            // Optionally send an error message to the user
            try {
                await modify.getCreator().finish(
                    modify.getCreator().startMessage()
                        .setRoom((await read.getRoomReader().getById(roomId)) ?? (() => { throw new Error(`Room with ID ${roomId} not found`); })())
                        .setSender(await read.getUserReader().getById(userId)!)
                        .setText('❌ Failed to process the audio message. Please try again later.')
                        .setThreadId(originalMsgId)
                );
            } catch (replyError) {
                logger.error('Error sending failure reply:', replyError);
            }
        }
    }

    private async transcribeAudioMessage(audioUrl: string, http: IHttp, logger: ILogger): Promise<string | null> {
        const timeout = 15000; // Set a timeout for the transcription request (in milliseconds)
        const startTime = Date.now();

        logger.debug(`[transcribeAudioMessage] Sending request to ${audioUrl} with timeout ${timeout}ms`);
        try {
            const response = await http.post('http://192.168.137.105:5005/transcribe', {
                headers: {
                    'Content-Type': 'application/json',
                },
                data: { audio_url: audioUrl },
            }); // Apply the timeout
            logger.debug(`[transcribeAudioMessage] Received response in ${Date.now() - startTime}ms with status code: ${response.statusCode}, data: ${JSON.stringify(response.data)}`);

            if (response.statusCode !== 200 || !response.data || !response.data.text) {
                const errorMessage = `Transcription API Error: ${JSON.stringify(response.data)}`;
                logger.error(`[transcribeAudioMessage] ${errorMessage}`);
                throw new Error(errorMessage);
            }

            return response.data.text;
        } catch (error) {
            logger.error(`[transcribeAudioMessage] Request failed after ${Date.now() - startTime}ms: ${error}`);
            throw error; // Re-throw the error to be caught in handleTranscriptionAndReply
        }
    }

    private async translateText(text: string, targetLanguage: string, http: IHttp, logger: ILogger): Promise<string | null> {
        
        const startTime = Date.now();

       
        try {
            const apiKey = "AIzaSyDp0xUQXA3AegT15k-ruzV9q0zHV4QSAs8"; // Replace with your actual API key
            const response = await http.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    contents: [
                        {
                            parts: [
                                {
                                    text: `Translate the following English sentence to ${targetLanguage}:\n\n"${text}". Return only the translated text.`
                                }
                            ]
                        }
                    ]
                }
            }); // Apply the timeout
            logger.debug(`[translateText] Received response in ${Date.now() - startTime}ms with status code: ${response.statusCode}, data: ${JSON.stringify(response.data)}`);

            if (response.statusCode !== 200) {
                const errorMessage = `Gemini translation failed: ${JSON.stringify(response.data)}`;
                logger.error(`[translateText] ${errorMessage}`);
                throw new Error(errorMessage);
            }

            return response.data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        } catch (error) {
            logger.error(`[translateText] Request failed after ${Date.now() - startTime}ms: ${error}`);
            throw error; // Re-throw the error
        }
    }
}