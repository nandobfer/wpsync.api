import { Prisma } from "@prisma/client"
import { prisma } from "../../prisma"
import WAWebJS from "whatsapp-web.js"
import { WashimaMessageId } from "./Washima"
import Fuse from "fuse.js"

export type MessageType = "ptt" | "video" | "image" | "text" | "revoked" | "sticker" | "audio" | "chat" | "document" | "sticker"

export enum MessageAck {
    error = -1,
    pending = 0,
    sent = 1,
    received = 2,
    read = 3,
    played = 4,
}

export type WashimaMessagePrisma = Prisma.WashimaMessageGetPayload<{}>


export interface WashimaMessageForm {
    message: WAWebJS.Message
    washima_id: string
    chat_id: string
    isGroup?: boolean
}

export class WashimaMessage {
    sid: string
    washima_id: string
    chat_id: string

    id: WashimaMessageId
    author?: string | null
    body: string
    from: string
    fromMe: boolean
    hasMedia: boolean
    timestamp: number
    to: string
    type: MessageType
    ack?: MessageAck | null
    edited: boolean
    deleted: boolean

    static async getChatMessages(chat_id: string, offset: number = 0, take?: number | null) {
        const data = await prisma.washimaMessage.findMany({
            where: { chat_id },
            orderBy: { timestamp: "desc" },
            skip: offset,
            take: take === null ? undefined : take || 10,
        })
        return data.map((item) => new WashimaMessage(item))
    }

    static async getWashimaMessages(washima_id: string, body?: any) {
        const data = await prisma.washimaMessage.findMany({ where: { washima_id, body }, orderBy: { timestamp: "desc" } })
        return data.map((item) => new WashimaMessage(item))
    }

    static async search(value: string) {
        const data = await prisma.washimaMessage.findMany({ orderBy: { timestamp: "desc" } })
        const all_messages = data.map((item) => new WashimaMessage(item))
        const messagesFuse = new Fuse(all_messages, {
            includeScore: true,
            keys: ["body"],
            threshold: 0.2, // Lower threshold for closer matches
            ignoreLocation: true, // Ignores the location of the match which allows for more general matching
            minMatchCharLength: 2, // Minimum character length of matches to consider
        })

        const messages_result = messagesFuse.search(value).map((item) => item.item)

        return messages_result
    }

    static async new(data: WashimaMessageForm) {
        const message = data.message

        if (data.isGroup && !message.fromMe) {
            const contact = await message.getContact()
            message.author = contact.name || `${contact.pushname} - ${contact.number}`
        }

        const saved = await prisma.washimaMessage.create({
            data: {
                washima_id: data.washima_id,
                chat_id: data.chat_id,
                sid: message.id._serialized,
                id: JSON.stringify(message.id),
                timestamp: JSON.stringify(message.timestamp),
                body: message.body || "",
                from: message.from || "",
                fromMe: message.fromMe || false,
                hasMedia: message.hasMedia || false,
                to: message.to || "",
                type: message.type || "",
                ack: message.ack || 0,
                author: message.author || "",
            },
        })

        return new WashimaMessage(saved)
    }

    static async update(message: WAWebJS.Message, options?: { edited?: boolean; deleted?: boolean }) {
        try {
            const data = await prisma.washimaMessage.update({
                where: { sid: message.id._serialized },
                data: {
                    ack: message.ack,
                    body: message.body,
                    timestamp: JSON.stringify(message.timestamp),
                    type: message.type,
                    author: message.author,
                    edited: options?.edited,
                    deleted: options?.deleted,
                },
            })

            return new WashimaMessage(data)
        } catch (error) {
            console.log(error)
        }
    }

    static async revoke(message: WAWebJS.Message) {
        try {
            const current_message = await prisma.washimaMessage.findFirst({
                where: { timestamp: message.timestamp.toString(), from: message.from, to: message.to },
            })
            if (current_message) {
                const data = await prisma.washimaMessage.update({
                    where: { sid: current_message.sid },
                    data: {
                        deleted: true,
                    },
                })

                return new WashimaMessage(data)
            } else {
                throw "message not found"
            }
        } catch (error) {
            console.log(error)
        }
    }

    constructor(data: WashimaMessagePrisma) {
        this.sid = data.sid
        this.washima_id = data.washima_id
        this.chat_id = data.chat_id

        this.id = JSON.parse(data.id)
        this.author = data.author
        this.body = data.body
        this.from = data.from
        this.fromMe = data.fromMe
        this.hasMedia = data.hasMedia
        this.timestamp = Number(data.timestamp)
        this.to = data.to
        this.type = data.type as MessageType
        this.ack = data.ack
        this.edited = data.edited
        this.deleted = data.deleted
    }
}
