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

import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';

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

            const appUser = await read.getUserReader().getAppUser();
            await modify.getNotifier().notifyUser(user, {
                sender: appUser!,
                room: room!,
                blocks: block.getBlocks(),
            });
            

            return context.getInteractionResponder().successResponse();
        }

        if (actionId === 'transcribe_translate') {
            const { audioUrl, originalMsgId, targetLanguage } = JSON.parse(data.value || '{}');
            this.handleTranscriptionAndReply(audioUrl, originalMsgId, user.id, room?.id ?? '', targetLanguage, read, http, modify, persistence, logger)
                .catch((error) => logger.error(`[executeBlockActionHandler] Error: ${error}`));

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
        persistence: IPersistence,
        logger: ILogger
    ): Promise<void> {
        const transKey = new RocketChatAssociationRecord(RocketChatAssociationModel.MESSAGE, `${originalMsgId}_transcription`);
        const transResults = await read.getPersistenceReader().readByAssociation(transKey) as Array<{ text: string }>;

        let transcribedText = transResults.length ? transResults[0].text : null;
        let textToSend = '';
        if (transcribedText){
            textToSend = `This transcription and translation is already available. \n`;
        }
        
        if (!transcribedText) {
            try {
                transcribedText = await this.transcribeAudioMessage(audioUrl, http, logger);
                if (transcribedText) {
                    await persistence.createWithAssociation({ text: transcribedText }, transKey);
                }
            } catch (e) {
                logger.error(`[Transcription] Failed: ${e}`);
            }
        }

        if (!transcribedText) {
            const userObj = await read.getUserReader().getById(userId);
            const roomObj = await read.getRoomReader().getById(roomId);
            const appUser = await read.getUserReader().getAppUser();

            return modify.getNotifier().notifyUser(userObj!, {
                sender: appUser!,
                room: roomObj!,
                text: '❌ Transcription failed.',
            });
        }

        const translateKey = new RocketChatAssociationRecord(RocketChatAssociationModel.MESSAGE, `${originalMsgId}_translation_${targetLanguage}`);
        const translateResults = await read.getPersistenceReader().readByAssociation(translateKey) as Array<{ text: string }>;

        let translatedText = translateResults.length ? translateResults[0].text : null;

        if (!translatedText) {
            try {
                translatedText = await this.translateText(transcribedText, targetLanguage, http, logger);
                if (translatedText) {
                    await persistence.createWithAssociation({ text: translatedText }, translateKey);
                }
            } catch (e) {
                logger.error(`[Translation] Failed: ${e}`);
            }
        }

        const roomObj = await read.getRoomReader().getById(roomId);
        const userObj = await read.getUserReader().getById(userId);

        textToSend += `*Transcription:* ${transcribedText}\n*Translation (${targetLanguage.toUpperCase()}):* ${translatedText ?? '❌ Translation failed.'}`;
        const appUser = await read.getUserReader().getAppUser();

        await modify.getNotifier().notifyUser(userObj!, {
            sender: appUser!,
            room: roomObj!,
            text: textToSend,
        });
        
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
            const apiKey = "gemini_api_key"; // Replace with your actual API key
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
