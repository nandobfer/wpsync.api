import { Prisma } from "@prisma/client"
import { WashimaMessageId } from "./Washima"
import WAWebJS from "whatsapp-web.js"
import { prisma } from "../../prisma"
import { getIoInstance } from "../../io/socket"

export type GroupUpdateType = "add" | "invite" | "remove" | "leave" | "subject" | "description" | "picture" | "announce" | "restrict" | "create"

export type WashimaGroupUpdatePrisma = Prisma.WashimaGroupUpdatesGetPayload<{}>
export interface WashimaGroupUpdateForm {
    notification: WAWebJS.GroupNotification
    washima_id: string
}

export interface WashimaNotificationId extends WashimaMessageId {
    fromMe: boolean
}

export class WashimaGroupUpdate {
    sid: string
    washima_id: string
    chat_id: string

    id: WashimaNotificationId
    author: string
    body: string
    recipientIds: string[]
    timestamp: number
    type: GroupUpdateType

    static async new(data: WashimaGroupUpdateForm) {
        const contact = await data.notification.getContact()
        data.notification.author = contact.name || `${contact.pushname} - ${contact.number}`

        const saved_update = await prisma.washimaGroupUpdates.create({
            data: {
                washima_id: data.washima_id,
                chat_id: data.notification.chatId,
                sid: (data.notification.id as WashimaNotificationId)._serialized,
                id: JSON.stringify(data.notification.id),
                recipientIds: JSON.stringify(data.notification.recipientIds),
                timestamp: JSON.stringify(data.notification.timestamp),

                author: data.notification.author,
                body: data.notification.body,
                type: data.notification.type,
            },
        })

        return new WashimaGroupUpdate(saved_update)
    }

    static async handleUpdate(data: WashimaGroupUpdateForm) {
        try {
            const update = await WashimaGroupUpdate.new(data)
            console.log(update)
            const io = getIoInstance()
            io.emit("washima:group:update", update)
        } catch (error) {
            console.log(error)
        }
    }

    static async getGroupUpdates(chat_id: string) {
        try {
            const data = await prisma.washimaGroupUpdates.findMany({ where: { chat_id } })
            return data.map((item) => new WashimaGroupUpdate(item))
        } catch (error) {
            console.log(error)
        }
    }

    constructor(data: WashimaGroupUpdatePrisma) {
        this.sid = data.sid
        this.washima_id = data.washima_id
        this.chat_id = data.chat_id

        this.id = JSON.parse(data.id)
        this.author = data.author
        this.body = data.body
        this.recipientIds = JSON.parse(data.recipientIds)
        this.timestamp = Number(data.timestamp)
        this.type = data.type as GroupUpdateType
    }
}
