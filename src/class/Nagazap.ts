import { Prisma } from "@prisma/client"
import { prisma } from "../prisma"
import axios, { AxiosError, AxiosInstance } from "axios"
import { OvenForm, WhatsappApiForm, WhatsappForm, WhatsappTemplateComponent } from "../types/shared/Meta/WhatsappBusiness/WhatsappForm"
import { UploadedFile } from "express-fileupload"
import * as fs from "fs"
import { getIoInstance } from "../io/socket"
import { BlacklistLog, FailedMessageLog, SentMessageLog } from "../types/shared/Meta/WhatsappBusiness/Logs"
import { HandledError, HandledErrorCode } from "./HandledError"
import { WithoutFunctions } from "./helpers"
import { User } from "./User"
import { BusinessInfo } from "../types/shared/Meta/WhatsappBusiness/BusinessInfo"
import { TemplateForm, TemplateFormResponse } from "../types/shared/Meta/WhatsappBusiness/TemplatesInfo"
import { MediaResponse } from "../types/shared/Meta/WhatsappBusiness/MediaResponse"
import path from "path"
import { saveFile } from "../tools/saveFile"

export type NagaMessageType = "text" | "reaction" | "sticker" | "image" | "audio" | "video" | "button"
export type NagaMessagePrisma = Prisma.NagazapMessageGetPayload<{}>
export type NagaMessageForm = Omit<Prisma.NagazapMessageGetPayload<{}>, "id" | "nagazap_id">
export const nagazap_include = Prisma.validator<Prisma.NagazapInclude>()({ user: true })
export type NagazapPrisma = Prisma.NagazapGetPayload<{ include: typeof nagazap_include }>
interface BuildHeadersOptions {
    upload?: boolean
}
export class NagaMessage {
    id: number
    from: string
    timestamp: string
    text: string
    name: string
    type: NagaMessageType

    constructor(data: NagaMessagePrisma) {
        this.id = data.id
        this.from = data.from
        this.timestamp = data.timestamp
        this.text = data.text
        this.name = data.name
        this.type = data.type as NagaMessageType
    }
}

const api = axios.create({
    baseURL: "https://graph.facebook.com/v19.0",
    // headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
})

export interface NagazapForm {
    token: string
    appId: string
    phoneId: string
    businessId: string
    userId: string
}

export class Nagazap {
    id: number
    token: string
    appId: string
    phoneId: string
    businessId: string
    lastUpdated: string
    stack: WhatsappForm[]
    blacklist: BlacklistLog[]
    frequency: string
    batchSize: number
    lastMessageTime: string
    paused: boolean
    sentMessages: SentMessageLog[]
    failedMessages: FailedMessageLog[]

    displayName: string | null
    displayPhone: string | null

    userId: string
    user: User

    static async initialize() {
        await Nagazap.shouldBake()
        setInterval(() => Nagazap.shouldBake(), 1 * 5 * 1000)
    }

    static async new(data: NagazapForm) {
        const new_nagazap = await prisma.nagazap.create({
            data: {
                appId: data.appId,
                businessId: data.businessId,
                phoneId: data.phoneId,
                token: data.token,
                userId: data.userId,

                batchSize: 20,
                frequency: "30",
                paused: true,
                lastUpdated: new Date().getTime().toString(),
                lastMessageTime: "",

                blacklist: "[]",
                failedMessages: "[]",
                sentMessages: "[]",
                stack: "[]",
            },
            include: nagazap_include,
        })

        const nagazap = new Nagazap(new_nagazap)
        const info = await nagazap.getInfo()
        if (!!info?.phone_numbers.data.length) {
            const phone = info.phone_numbers.data[0]
            await nagazap.update({ displayName: phone.verified_name, displayPhone: phone.display_phone_number })
            return nagazap
        } else {
            await prisma.nagazap.delete({ where: { id: nagazap.id } })
            throw new HandledError({
                code: HandledErrorCode.nagazap_no_info,
                text: "Não foi possível realizar o cadastrado, verifique os dados enviados.",
            })
        }
    }

    static async getByBusinessId(business_id: string) {
        const data = await prisma.nagazap.findFirst({ where: { businessId: business_id }, include: nagazap_include })
        if (data) {
            return new Nagazap(data)
        } else {
            throw new HandledError({ code: HandledErrorCode.nagazap_not_found, text: "Nagazap não encontrado" })
        }
    }

    static async getById(id: number) {
        const data = await prisma.nagazap.findUnique({ where: { id }, include: nagazap_include })
        if (data) {
            return new Nagazap(data)
        } else {
            throw new HandledError({ code: HandledErrorCode.nagazap_not_found, text: "Nagazap não encontrado" })
        }
    }

    static async getByUserId(user_id: string) {
        const data = await prisma.nagazap.findMany({ where: { userId: user_id }, include: nagazap_include })
        return data.map((item) => new Nagazap(item))
    }

    static async getAll() {
        const data = await prisma.nagazap.findMany({ include: nagazap_include })
        return data.map((item) => new Nagazap(item))
    }

    static async shouldBake() {
        const nagazaps = await Nagazap.getAll()
        nagazaps.forEach((nagazap) => {
            try {
                if (!nagazap.stack.length) return

                const lastTime = new Date(Number(nagazap.lastMessageTime || 0))
                const now = new Date()
                if (now.getTime() >= lastTime.getTime() + Number(nagazap.frequency) * 1000 * 60 && !!nagazap.stack.length && !nagazap.paused) {
                    nagazap.bake()
                }
            } catch (error) {
                if (error instanceof HandledError && error.code === HandledErrorCode.nagazap_not_found) {
                } else {
                    console.log(error)
                }
            }
        })
    }

    static async delete(id: number) {
        const data = await prisma.nagazap.delete({ where: { id } })
        return data
    }

    constructor(data: NagazapPrisma) {
        this.id = data.id
        this.token = data.token
        this.appId = data.appId
        this.phoneId = data.phoneId
        this.businessId = data.businessId
        this.lastUpdated = data.lastUpdated
        this.stack = JSON.parse(data.stack)

        this.frequency = data.frequency
        this.batchSize = data.batchSize
        this.lastMessageTime = data.lastMessageTime
        this.paused = data.paused
        this.sentMessages = JSON.parse(data.sentMessages)
        this.failedMessages = JSON.parse(data.failedMessages)
        this.userId = data.userId
        this.user = new User(data.user)
        this.displayName = data.displayName
        this.displayPhone = data.displayPhone

        this.blacklist = this.loadBlacklist(JSON.parse(data.blacklist))
    }

    loadBlacklist(saved_list: any[]) {
        const old_format = saved_list.filter((item) => typeof item === "string")
        const new_format = saved_list.filter((item) => !!item.timestamp) as BlacklistLog[]

        const first_message = this.sentMessages.reduce((previous, current) => (previous.timestamp < current.timestamp ? previous : current))

        const new_list: BlacklistLog[] = [
            ...old_format.map((item) => {
                const matching_number_message = this.sentMessages.find((message) => message.data.contacts[0].wa_id.slice(2) === item)
                return { number: item, timestamp: matching_number_message?.timestamp || first_message.timestamp }
            }),
            ...new_format,
        ]

        return new_list
    }

    async getMessages() {
        const data = await prisma.nagazapMessage.findMany({ where: { nagazap_id: this.id } })
        const messages = data.map((item) => new NagaMessage(item))
        return messages
    }

    async update(data: Partial<WithoutFunctions<Nagazap>>) {
        const updated = await prisma.nagazap.update({
            where: { id: this.id },
            data: { token: data.token, displayName: data.displayName, displayPhone: data.displayPhone, lastUpdated: new Date().getTime().toString() },
        })
        this.token = updated.token
        this.displayName = updated.displayName
        this.displayPhone = updated.displayPhone
        this.lastUpdated = updated.lastUpdated
        this.emit()
        return this
    }

    async updateToken(token: string) {
        const data = await prisma.nagazap.update({ where: { id: this.id }, data: { token, lastUpdated: new Date().getTime().toString() } })
        this.token = data.token
        this.lastUpdated = data.lastUpdated
        this.emit()
    }

    buildHeaders(options?: BuildHeadersOptions) {
        return { Authorization: `Bearer ${this.token}`, "Content-Type": options?.upload ? "multipart/form-data" : "application/json" }
    }

    async getInfo() {
        try {
            const response = await api.get(`/${this.businessId}?fields=id,name,phone_numbers`, {
                headers: this.buildHeaders(),
            })

            console.log(JSON.stringify(response.data, null, 4))
            return response.data as BusinessInfo
        } catch (error) {
            console.log(JSON.stringify(error, null, 4))
        }
    }

    async saveMessage(data: NagaMessageForm) {
        const prisma_message = await prisma.nagazapMessage.create({
            data: {
                ...data,
                nagazap_id: this.id,
                timestamp: (Number(data.timestamp) * 1000).toString(),
            },
        })

        const message = new NagaMessage(prisma_message)
        const io = getIoInstance()
        io.emit(`nagazap:${this.id}:message`, message)

        if (message.text.toLowerCase() == "parar promoções") {
            this.addToBlacklist(message.from)
        }
        return message
    }

    async addToBlacklist(number: string) {
        if (this.blacklist.find((item) => item.number === number)) return
        this.blacklist.push({ number, timestamp: new Date().getTime().toString() })
        await prisma.nagazap.update({ where: { id: this.id }, data: { blacklist: JSON.stringify(this.blacklist) } })
        console.log(`número ${number} adicionado a blacklist`)
        this.emit()
    }

    async removeFromBlacklist(number: string) {
        if (this.blacklist.find((item) => item.number === number)) return
        this.blacklist = this.blacklist.filter((item) => item.number != number)
        await prisma.nagazap.update({ where: { id: this.id }, data: { blacklist: JSON.stringify(this.blacklist) } })
        console.log(`número ${number} removido da blacklist`)
        this.emit()
    }

    async getTemplates() {
        const response = await api.get(`/${this.businessId}?fields=id,name,message_templates`, {
            headers: this.buildHeaders(),
        })

        const templates = response.data.message_templates.data
        console.log(templates)
        return templates
    }

    async uploadMedia(file: UploadedFile, filepath: string) {
        const response = await api.post(
            `/${this.phoneId}/media`,
            {
                messaging_product: "whatsapp",
                type: file.mimetype,
                file: fs.createReadStream(filepath),
            },
            { headers: this.buildHeaders({ upload: true }) }
        )
        console.log(response.data.id)
        return response.data.id as string
    }

    async sendMessage(message: WhatsappForm) {
        const number = message.number.toString().replace(/\D/g, "")
        if (this.blacklist.find((item) => item.number === (number.length == 10 ? number : number.slice(0, 2) + number.slice(3)))) {
            console.log(`mensagem não enviada para ${number} pois está na blacklist`)
            return
        }

        const form: WhatsappApiForm = {
            messaging_product: "whatsapp",
            template: {
                language: { code: message.language },
                name: message.template,
                components: message.components,
            },
            type: "template",
            to: "+55" + number,
        }

        try {
            const whatsapp_response = await api.post(`/${this.phoneId}/messages`, form, { headers: this.buildHeaders() })
            console.log(whatsapp_response.data)
            this.log(whatsapp_response.data)
        } catch (error) {
            if (error instanceof AxiosError) {
                console.log(error.response?.data)
                this.errorLog(error.response?.data, number)
            } else {
                console.log(error)
            }
        }
    }

    async queueMessage(data: WhatsappForm) {
        this.stack.push(data)
        await prisma.nagazap.update({ where: { id: this.id }, data: { stack: JSON.stringify(this.stack) } })

        return this.stack
    }

    async queueBatch(data: WhatsappForm[]) {
        this.stack = [...this.stack, ...data]
        await prisma.nagazap.update({ where: { id: this.id }, data: { stack: JSON.stringify(this.stack) } })

        return this.stack
    }

    async prepareBatch(data: OvenForm, image_id = "") {
        const forms: WhatsappForm[] = data.to.map((number) => {
            return {
                number,
                template: data.template!.name,
                language: data.template!.language,
                components: data
                    .template!.components.filter((component) => component.format == "IMAGE")
                    .map((component) => {
                        const component_data: WhatsappTemplateComponent = {
                            type: component.type.toLowerCase() as "header" | "body" | "footer",
                            parameters: component.format == "IMAGE" ? [{ type: "image", image: { id: image_id } }] : [],
                        }
                        return component_data
                    }),
            }
        })

        await this.queueBatch(forms)
    }

    async updateOvenSettings(data: { batchSize?: number; frequency?: string }) {
        const updated = await prisma.nagazap.update({ where: { id: this.id }, data })
        this.batchSize = updated.batchSize
        this.frequency = updated.frequency
        this.emit()
    }

    async saveStack() {
        this.lastMessageTime = new Date().getTime().toString()
        const data = await prisma.nagazap.update({
            where: { id: this.id },
            data: { stack: JSON.stringify(this.stack), lastMessageTime: this.lastMessageTime },
        })
        this.emit()
    }

    async bake() {
        const batch = this.stack.slice(0, this.batchSize)
        const sent = await Promise.all(batch.map(async (message) => this.sendMessage(message)))

        this.stack = this.stack.slice(this.batchSize)
        await this.saveStack()
        if (this.stack.length === 0) {
            await this.pause()
        }
    }

    async pause() {
        this.paused = true
        await prisma.nagazap.update({ where: { id: this.id }, data: { paused: this.paused } })
        this.emit()
    }

    async start() {
        this.paused = false
        await prisma.nagazap.update({ where: { id: this.id }, data: { paused: this.paused } })
        this.emit()
    }

    async clearOven() {
        this.stack = []
        await prisma.nagazap.update({ where: { id: this.id }, data: { stack: JSON.stringify(this.stack) } })
        this.emit()
    }

    async log(data: any) {
        this.sentMessages.push({ timestamp: new Date().getTime().toString(), data })
        await prisma.nagazap.update({ where: { id: this.id }, data: { sentMessages: JSON.stringify(this.sentMessages) } })
    }

    async errorLog(data: any, number: string) {
        this.failedMessages.push({ timestamp: new Date().getTime().toString(), data, number })
        await prisma.nagazap.update({ where: { id: this.id }, data: { failedMessages: JSON.stringify(this.failedMessages) } })
    }

    async createTemplate(data: TemplateForm) {
        const response = await api.post(`/${this.businessId}/message_templates`, data, {
            headers: this.buildHeaders(),
        })
        const result = response.data as TemplateFormResponse
        return result
    }

    async uploadTemplateMedia(file: UploadedFile) {
        const session_id_response = await api.post(
            `/${this.appId}/uploads?file_name=${file.name}&file_length=${file.size}&file_type=${file.mimetype}&access_token=${this.token}`
        )
        const session_id = session_id_response.data.id as string

        const upload_response = await api.post(`/${session_id}`, file.data, {
            headers: { Authorization: `OAuth ${this.token}`, "Content-Type": "application/octet-stream" },
        })
        console.log(upload_response.data)
        return upload_response.data
    }

    async downloadMedia(media_id: string) {
        const response = await api.get(`/${media_id}`, { headers: this.buildHeaders() })
        const media_object = response.data as MediaResponse
        const media_response = await axios.get(media_object.url, { headers: { Authorization: `Bearer ${this.token}` }, responseType: "arraybuffer" })
        const { url } = saveFile(`nagazap/${this.id}/media`, {
            file: media_response.data,
            name: media_object.id + "." + media_object.mime_type.split("/")[1].split(";")[0],
        })
        return url
    }

    emit() {
        const io = getIoInstance()
        io.emit(`nagazap:${this.id}:update`, this)
    }
}
