import { Prisma } from "@prisma/client"
import WAWebJS, { Client, LocalAuth, Message, MessageMedia } from "whatsapp-web.js"
import { prisma } from "../../prisma"
import { FileUpload, WithoutFunctions } from "../helpers"
import { uid } from "uid"
import { getIoInstance } from "../../io/socket"
import { Socket } from "socket.io"
import axios from "axios"
import { saveFile } from "../../tools/saveFile"
import { convertFile } from "../../tools/convertMedia"
import { WashimaMessage } from "./WashimaMessage"
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library"
import { WashimaGroupUpdate, WashimaGroupUpdateForm } from "./WashimaGroupUpdate"
import { getDirectorySize } from "../../tools/getDirectorySize"
import { deleteDirectory } from "../../tools/deleteDirectory"
import Fuse from "fuse.js"
import { User } from "../User"
import numeral from "numeral"
// import numeral from 'numeral'

// export const washima_include = Prisma.validator<Prisma.WashimaInclude>()({  })
export type WashimaPrisma = Prisma.WashimaGetPayload<{}>
export type WashimaMediaPrisma = Prisma.WashimaMediaGetPayload<{}>
export type WashimaProfilePicPrisma = Prisma.WashimaProfilePicGetPayload<{}>
export interface WashimaDiskMetrics {
    messages: number
    media: number
}

export type WashimaForm = Omit<
    WithoutFunctions<Washima>,
    "id" | "created_at" | "active" | "client" | "qrcode" | "ready" | "info" | "chats" | "contact" | "users"
> & { user_id: string }

export interface WashimaMessageId {
    fromMe: boolean
    id: string
    remote: string
    _serialized: string
}

interface WashimaMediaFormHelper extends FileUpload {
    mimetype: string
    base64: string
    size?: number
}

export type WashimaMediaForm = Omit<WashimaMediaFormHelper, "name"> & { name?: string; convertToFormat?: string }

export class WashimaProfilePic {
    chat_id: string
    last_updated: string
    url: string

    constructor(data: WashimaProfilePicPrisma) {
        this.chat_id = data.chat_id
        this.last_updated = data.last_updated
        this.url = data.url
    }
}

export class WashimaMedia {
    message_id: string
    filename: string
    data: string
    mimetype: string
    size: string

    static async new(data: WashimaMediaPrisma) {
        try {
            const media_prisma = await prisma.washimaMedia.create({
                data: {
                    data: data.data,
                    filename: data.filename,
                    message_id: data.message_id,
                    mimetype: data.mimetype,
                    washima_id: data.washima_id,
                    size: data.size,
                },
            })
            return new WashimaMedia(media_prisma)
        } catch (error) {
            console.log(error)
        }
    }

    static async get(message_id: string) {
        const data = await prisma.washimaMedia.findUnique({ where: { message_id } })
        if (!data) return

        return new WashimaMedia(data)
    }

    static async getMetadata(message_id: string) {
        const data = await prisma.washimaMedia.findUnique({
            where: { message_id },
            select: { filename: true, mimetype: true, size: true, message_id: true, washima_id: true },
        })
        if (!data) return

        return new WashimaMedia({ ...data, data: "" })
    }

    constructor(data: WashimaMediaPrisma) {
        this.message_id = data.message_id
        this.filename = data.filename
        this.mimetype = data.mimetype
        this.data = data.data
        this.size = data.size
    }
}

export class Washima {
    id: string
    name: string
    number: string
    created_at: string
    active: boolean
    ready: boolean

    client: Client
    qrcode?: string
    info: WAWebJS.ClientInfo
    chats: WAWebJS.Chat[]
    contact: string
    diskMetrics?: WashimaDiskMetrics

    users: User[] = []

    static washimas: Washima[] = []
    static waitingList: Washima[] = []

    static find(id: string) {
        const washima = Washima.washimas.find((item) => item.id === id)
        return washima
    }

    static async query(id: string) {
        const data = await prisma.washima.findUnique({ where: { id } })
        if (!data) throw "washima não encontrado"
        const washima = new Washima(data)
        return washima
    }

    static async list() {
        const data = await prisma.washima.findMany({ orderBy: { created_at: "desc" } })
        const list = data.map((item) => new Washima(item))
        return list
    }

    static async initialize() {
        console.log("initializing washimas")
        const washimas = await Washima.list()
        console.log(`${washimas.length} whatsapp numbers`)

        const io = getIoInstance()
        io.emit("washima:list", washimas)

        const washima = washimas.pop()
        if (washima) {
            await washima.initialize(washimas)
        }
    }

    static push(washima: Washima) {
        Washima.washimas = Washima.washimas.filter((item) => item.id !== washima.id)
        Washima.washimas.push(washima)
    }

    static async new(data: WashimaForm) {
        const washima_prisma = await prisma.washima.create({
            data: {
                id: uid(),
                created_at: new Date().getTime().toString(),
                name: data.name,
                number: data.number,
                users: { connect: { id: data.user_id } },
            },
        })

        const washima = new Washima(washima_prisma)

        Washima.push(washima)
        return washima
    }

    static async delete(washima_id: string) {
        const deleted = await prisma.washima.delete({ where: { id: washima_id } })
        const washima = Washima.find(deleted.id)
        if (washima) {
            await washima.client.destroy()
            Washima.washimas = Washima.washimas.filter((item) => item.id !== washima_id)
            await deleteDirectory(`static/washima/auth/whatsapp.auth.${washima.id}`)
            await deleteDirectory(`static/washima/${washima.id}`)
            return washima
        }
    }

    static async sendMessage(socket: Socket, washima_id: string, chat_id: string, message?: string, media?: WashimaMediaForm) {
        try {
            const washima = Washima.find(washima_id)
            if (washima && chat_id) {
                if (media?.convertToFormat) {
                    const convertedBase64 = (await convertFile({
                        file: media.file as ArrayBuffer,
                        output_format: media.convertToFormat,
                        returnBase64: true,
                        // customArgs: ["-acodec", "opus", "-ac", "1", "-f", "ogg", "-avoid_negative_ts", "make_zero"],
                    })) as string

                    media.base64 = convertedBase64
                }
                await washima.sendMessage(chat_id, message, media)
                socket.emit("washima:message:sent")
            }
        } catch (error) {
            console.log(error)
        }
    }

    static async getContact(socket: Socket, washima_id: string, contact_id: string, message_id: string) {
        const washima = Washima.find(washima_id)
        if (washima) {
            try {
                const name = await washima.getContact(contact_id)
                socket.emit("washima:message:contact", message_id, name)
            } catch (error) {
                console.log("error getting contact")
                console.log(error)
            }
        }
    }

    constructor(data: WashimaPrisma) {
        this.id = data.id
        this.name = data.name
        this.number = data.number
        this.created_at = data.created_at
        this.active = data.active
        this.ready = false

        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: `static/washima/auth/whatsapp.auth.${this.id}` }),
            puppeteer: {
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                executablePath: "/usr/bin/google-chrome-stable",
            },
        })
        this.info = this.client.info
        this.chats = []
        this.contact = ""
    }

    async initialize(queue?: Washima[]) {
        console.log(`initializing ${this.name} - ${this.number}`)

        try {
            const users = await User.getUsersFromWashimaId(this.id)
            this.users = users
            Washima.push(this)
            const io = getIoInstance()
            io.emit("washima:update", this)
            await this.client.initialize()

            //* CLIENT EVENTS

            this.client.on("qr", (qr) => {
                if (!this.qrcode) {
                    const next_washima = queue?.pop()
                    if (next_washima) {
                        next_washima.initialize(queue)
                    }
                }

                this.qrcode = qr
                console.log("whatsapp is disconnected. QrCode ready: " + this.qrcode)
                // qrcode.generate(qr, { small: true })

                const io = getIoInstance()
                io.emit("washima:qrcode", this.qrcode, this.id)
            })

            this.client.on("ready", async () => {
                console.log(`${this.name} - ${this.number} client is ready, initializing data`)
                this.qrcode = ""
                this.ready = false
                io.emit("washima:ready", this.id)
                io.emit("washima:update", this)

                io.emit(`washima:${this.id}:init`, "Configurando metadados", 1)
                console.log(`washima:${this.id}:init`, "Configurando metadados", 1)
                this.info = this.client.info
                io.emit(`washima:${this.id}:init`, "Buscando chats", 2)
                console.log(`washima:${this.id}:init`, "Buscando chats", 2)
                this.chats = await this.client.getChats()
                this.ready = true
                io.emit(`washima:${this.id}:init`, "Carregando informações do contato", 3)
                console.log(`washima:${this.id}:init`, "Carregando informações do contato", 3)
                this.contact = await this.getContact(this.info.wid._serialized)
                io.emit(`washima:${this.id}:init`, "Pronto", 4)
                console.log(`washima:${this.id}:init`, "Pronto", 4)

                io.emit("washima:update", this)

                const next_washima = queue?.pop()
                if (next_washima) {
                    await next_washima.initialize(queue)
                }
            })

            this.client.on("disconnected", async () => {
                await this.restart()
            })

            this.client.on("message_ack", async (message, ack) => {
                const chat = await message.getChat()
                try {
                    const updated = await WashimaMessage.update(message)
                    io.emit("washima:message:update", updated, chat.id._serialized)
                    io.emit(`washima:${this.id}:message`, { chat, message: updated })
                } catch (error) {
                    console.log(error)
                }
                const index = this.chats.findIndex((item) => item.id._serialized === chat.id._serialized)
                this.chats[index] = { ...chat, lastMessage: message, unreadCount: message.fromMe ? 0 : (this.chats[index]?.unreadCount || 0) + 1 }

                io.emit("washima:update", this)
            })

            this.client.on("message_revoke_everyone", async (message, revoked) => {
                const chat = await message.getChat()
                try {
                    const updated = await WashimaMessage.revoke(message)
                    io.emit("washima:message:update", updated, chat.id._serialized)
                    io.emit(`washima:${this.id}:message`, { chat, message: updated })
                } catch (error) {
                    console.log(error)
                }
                const index = this.chats.findIndex((item) => item.id._serialized === chat.id._serialized)
                this.chats[index] = { ...chat, lastMessage: message, unreadCount: message.fromMe ? 0 : (this.chats[index]?.unreadCount || 0) + 1 }

                io.emit("washima:update", this)
            })

            this.client.on("message_edit", async (message, new_body, previous_body) => {
                if (new_body === previous_body) return

                const chat = await message.getChat()
                try {
                    const updated = await WashimaMessage.update(message, { edited: true })
                    io.emit("washima:message:update", updated, chat.id._serialized)
                    io.emit(`washima:${this.id}:message`, { chat, message: updated })
                } catch (error) {
                    console.log(error)
                }
                const index = this.chats.findIndex((item) => item.id._serialized === chat.id._serialized)
                this.chats[index] = { ...chat, lastMessage: message, unreadCount: message.fromMe ? 0 : (this.chats[index]?.unreadCount || 0) + 1 }

                io.emit("washima:update", this)
            })

            this.client.on("message_create", async (message) => {
                try {
                    const io = getIoInstance()
                    const chat = await message.getChat()

                    if (message.hasMedia) {
                        await this.getCachedMedia(message)
                    }

                    const index = this.chats.findIndex((item) => item.id._serialized === chat.id._serialized)

                    this.chats[index] = { ...chat, lastMessage: message, unreadCount: message.fromMe ? 0 : (this.chats[index]?.unreadCount || 0) + 1 }

                    const washima_message = await WashimaMessage.new({
                        chat_id: chat.id._serialized,
                        washima_id: this.id,
                        message,
                        isGroup: chat.isGroup,
                    })

                    io.emit("washima:message", { chat, message: washima_message }, this.id)
                    io.emit(`washima:${this.id}:message`, { chat: this.chats[index], message: washima_message })
                    io.emit("washima:update", this)
                } catch (error) {
                    console.log({ error })
                }
            })

            this.client.on("group_join", async (notification) => {
                try {
                    const chat = await notification.getChat()
                    const chat_index = this.chats.findIndex((item) => item.id._serialized === chat.id._serialized)
                    if (chat_index === -1) {
                        this.chats.push(chat)
                    } else {
                        this.chats[chat_index] = chat
                    }

                    io.emit("washima:update", this)

                    this.sendBulkGroupNotification(notification)
                } catch (error) {
                    console.log(error)
                }
            })

            this.client.on("group_update", async (notification) => {
                if (notification.type === "picture") {
                    await this.cacheProfilePic(notification.chatId)
                }
                WashimaGroupUpdate.handleUpdate({ notification, washima_id: this.id })
            })
            this.client.on("group_leave", async (notification) => this.sendBulkGroupNotification(notification))
            this.client.on("group_membership_request", async (notification) => WashimaGroupUpdate.handleUpdate({ notification, washima_id: this.id }))
            this.client.on("group_admin_changed", async (notification) => WashimaGroupUpdate.handleUpdate({ notification, washima_id: this.id }))
        } catch (error) {
            console.log(`failed to initialize ${this.name} - ${this.number} whatsapp`)
            console.log(error)
        }
    }

    async sendBulkGroupNotification(notification: WAWebJS.GroupNotification) {
        try {
            const body: string[] = []
            for (const [index, recipientId] of notification.recipientIds.entries()) {
                const contact = await this.getContact(recipientId)
                body.push(contact)
            }
            notification.body = JSON.stringify(body)
            const notification_form: WashimaGroupUpdateForm = { notification, washima_id: this.id }
            await WashimaGroupUpdate.handleUpdate(notification_form)
        } catch (error) {
            console.log(error)
        }
    }

    async update(data: Partial<Washima>) {
        const updated = await prisma.washima.update({
            where: { id: this.id },
            data: {
                active: data.active,
                name: data.name,
                number: data.number,
            },
        })

        this.active = updated.active
        this.name = updated.name
        this.number = updated.number

        const io = getIoInstance()
        io.emit("washima:update", this)
    }

    async getContactPicture(target_id: string, target?: "chat" | "message") {
        try {
            const profilePic = await this.getCachedProfilePicture(target_id, target)
            return profilePic
        } catch (error) {
            console.log("error getting contact image")
            console.log(error)
        }
    }

    async buildChat(id: string, offset?: number, isGroup?: boolean) {
        try {
            // const chat = await this.client.getChatById(id)
            const messages = await WashimaMessage.getChatMessages(id, offset)
            // const messages = await chat.fetchMessages({ limit: Number.MAX_VALUE })

            if (isGroup) {
                const group_updates = await WashimaGroupUpdate.getGroupUpdates(id)
                console.log(group_updates)

                return { messages, group_updates }
            }

            return { messages }
        } catch (error) {
            console.log("error building chat")
            console.log(error)
        }
    }

    async getMessage(message_id: string) {
        const message = await this.client.getMessageById(message_id)
        return message
    }

    async sendMessage(chat_id: string, message?: string, media?: WashimaMediaForm) {
        const mediaMessage = media ? new MessageMedia(media.mimetype, media.base64, media.name, media.size) : undefined
        if (!message && !mediaMessage) return

        const chat = await this.client.getChatById(chat_id)
        await chat.sendMessage((message || mediaMessage)!, { media: mediaMessage, sendAudioAsVoice: true })
    }

    async getContact(contact_id: string) {
        try {
            const contact = await this.client.getContactById(contact_id)

            return contact.name || contact.pushname ? `${contact.pushname} - ${contact.number}` : contact.number
        } catch (error) {
            console.log(error)
            return ""
        }
    }

    async getMedia(message: Message) {
        const media = await this.getCachedMedia(message)

        return media
    }

    async restart() {
        try {
            console.log("merda")
            this.qrcode = ""
            console.log("merda 2")
            this.ready = false
            console.log("merda 3")
            await this.client.destroy()
            console.log("merda 4")
            await this.client.initialize()
            console.log("merda 5")
            const io = getIoInstance()
            console.log("merda 6")
            io.emit("washima:update", this)
            console.log("merda 7")
        } catch (error) {}
    }

    async getMediaMeta(message_id: string) {
        const mediaMeta = await WashimaMedia.getMetadata(message_id)
        return mediaMeta
    }

    async cacheProfilePic(target_id: string, target: "chat" | "message" = "chat") {
        let contact: WAWebJS.Contact
        try {
            if (target === "chat") {
                const chat = await this.client.getChatById(target_id)
                contact = await chat.getContact()
            }
            if (target === "message") {
                const message = await this.client.getMessageById(target_id)
                contact = await message.getContact()
            }

            const whatsapp_url = await contact!.getProfilePicUrl()
            const response = await axios.get(whatsapp_url, { responseType: "arraybuffer" })
            const buffer = Buffer.from(response.data, "binary")
            const url =
                saveFile(`/washima/${this.id}/profilePics`, { name: target_id + ".jpg", file: buffer }).url +
                "?time=" +
                new Date().getTime().toString()
            const now = new Date().getTime().toString()

            const cached = await prisma.washimaProfilePic.findUnique({ where: { chat_id: target_id } })
            if (cached) {
                const updated = await prisma.washimaProfilePic.update({
                    where: { chat_id: target_id },
                    data: { url, last_updated: now },
                })
                return new WashimaProfilePic(updated)
            }

            const new_cache = await prisma.washimaProfilePic.create({ data: { chat_id: target_id, last_updated: now, url, washima_id: this.id } })
            return new WashimaProfilePic(new_cache)
        } catch (error) {
            console.log(error)
        }
    }

    async getCachedMedia(message: Message) {
        const id = message.id._serialized
        const media = await WashimaMedia.get(id)

        if (media) {
            return media
        }

        try {
            const first_time_media = await message.downloadMedia()
            const size = Buffer.byteLength(first_time_media.data, "utf8")
            const formatted_size = numeral(size).format("0.00 b")
            const new_cached = await WashimaMedia.new({
                data: first_time_media.data,
                filename: first_time_media.filename || id + "." + first_time_media.mimetype.split("/")[1].split(";")[0],
                message_id: id,
                mimetype: first_time_media.mimetype,
                washima_id: this.id,
                size: formatted_size,
            })
            return new_cached
        } catch (error) {
            console.log(error)
            console.log(id)
        }
    }

    async getCachedProfilePicture(target_id: string, target?: "chat" | "message") {
        const cached = await prisma.washimaProfilePic.findUnique({ where: { chat_id: target_id } })
        if (cached && Number(cached.last_updated) - 1000 * 60 * 60 * 24 <= new Date().getTime()) {
            return new WashimaProfilePic(cached)
        }

        const new_cache = await this.cacheProfilePic(target_id, target)
        return new_cache
    }

    async fetchAndSaveAllMessages(options?: { groupOnly?: boolean }) {
        if (!this.ready || !this.chats.length) return
        const io = getIoInstance()

        console.log(`fetching messages for washima ${this.name}`)

        const chats = options?.groupOnly ? this.chats.filter((chat) => chat.isGroup) : this.chats

        for (const [chat_index, chat] of chats.entries()) {
            console.log(`loading messages for chat ${chat.name}. ${chat_index + 1}/${chats.length}`)
            io.emit(`washima:${this.id}:sync:chat`, chat_index + 1, chats.length)

            try {
                const messages = await chat.fetchMessages({ limit: Number.MAX_VALUE })

                for (const [index, message] of messages.entries()) {
                    console.log(`fetching message ${index + 1}/${messages.length} from chat ${chat_index + 1}/${chats.length}`)
                    io.emit(`washima:${this.id}:sync:messages`, index + 1, messages.length)

                    try {
                        const washima_message = await WashimaMessage.new({
                            washima_id: this.id,
                            chat_id: chat.id._serialized,
                            message,
                            isGroup: chat.isGroup,
                        })
                    } catch (error) {
                        if (error instanceof PrismaClientKnownRequestError && error.meta?.target === "PRIMARY") {
                            try {
                                const washima_message = await WashimaMessage.update(message)
                            } catch (error) {
                                console.log(error)
                            }
                        } else {
                            console.log(`failed to create/update message ${message.id._serialized}`)
                            console.log("")
                            console.log(error)
                            console.log("")
                            // console.log(message)
                        }
                    }
                }
            } catch (error) {
                console.log(`failed to fetch messages for chat ${chat.name} due to ${error}`)
            }
        }

        console.log("finished")
    }

    async getTableUsage(table: string, megabyte?: boolean) {
        interface AvgRowLength {
            AVG_ROW_LENGTH: number
        }
        const [avgRowData] = await prisma.$queryRaw<AvgRowLength[]>`
        SELECT AVG_ROW_LENGTH
        FROM information_schema.TABLES
        WHERE TABLE_NAME = ${table}
    `
        const { AVG_ROW_LENGTH } = avgRowData
        const avgRowLengthInMB = Number(AVG_ROW_LENGTH) / (megabyte ? 1024 * 1024 : 1)

        return avgRowLengthInMB
    }

    async getDiskUsage(megabyte = true) {
        const message_metrics = await this.getTableUsage("WashimaMessage", megabyte)
        const messages_count = await prisma.washimaMessage.count({ where: { washima_id: this.id } })
        const media_metrics = await this.getTableUsage("WashimaMedia", megabyte)
        const media_count = await prisma.washimaMedia.count({ where: { washima_id: this.id } })
        const profile_pic_metrics = (await getDirectorySize(`static/washima/${this.id}/profilePics`)) / (megabyte ? 1024 * 1024 : 1)
        this.diskMetrics = { media: media_metrics * media_count + profile_pic_metrics, messages: message_metrics * messages_count }
        console.log(this.diskMetrics)

        return this.diskMetrics
    }

    async clearMedia() {
        const profilePic = await prisma.washimaProfilePic.deleteMany()
        await deleteDirectory(`static/washima/${this.id}/profilePics`)
        const deletion = await prisma.washimaMedia.deleteMany({ where: { washima_id: this.id } })
        return deletion.count
    }

    async clearMessages() {
        const deletion = await prisma.washimaMessage.deleteMany({ where: { washima_id: this.id } })
        return deletion.count
    }

    async search(value: string) {
        // const matchingChats = this.chats.filter((chat) => chat.name)
        const chatsFuse = new Fuse(this.chats, {
            includeScore: true,
            keys: ["name"],
            threshold: 0.2, // Lower threshold for closer matches
            ignoreLocation: true, // Ignores the location of the match which allows for more general matching
            minMatchCharLength: 2, // Minimum character length of matches to consider
        })
        const chatsResults = chatsFuse.search(value).map((result) => result.item)

        const allMessagesResults = await WashimaMessage.search(value)
        const messagesResults = allMessagesResults.filter((message) => this.chats.find((chat) => chat.id._serialized === message.chat_id))

        messagesResults.forEach((message) => {
            if (message.to !== this.info.wid._serialized && message.from !== this.info.wid._serialized) return

            const chat = this.chats.find((chat) => chat.id._serialized === message.chat_id)
            if (chat) {
                // @ts-ignore
                chatsResults.push({ ...chat, lastMessage: message })
            }
        })
        chatsResults.sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp)

        return chatsResults
    }

    toJSON() {
        return { ...this, client: null }
    }
}
