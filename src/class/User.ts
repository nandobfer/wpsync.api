import { Prisma } from "@prisma/client"
import { LoginForm } from "../types/shared/LoginForm"
import { prisma } from "../prisma"
import { uid } from "uid"
import { WithoutFunctions } from "./helpers"
import { Washima } from "./Washima/Washima"
import numeral from "numeral"
import { Nagazap, nagazap_include } from "./Nagazap"

export type UserPrisma = Prisma.UserGetPayload<{}>

export type UserForm = Omit<WithoutFunctions<User>, "id" | "admin">

export class User {
    id: string
    name: string
    email: string
    password: string
    admin: boolean

    static async new(data: UserForm) {
        const new_user = await prisma.user.create({
            data: {
                id: uid(),
                email: data.email,
                name: data.name,
                password: data.password,
            },
        })

        return new User(new_user)
    }

    static async login(data: LoginForm) {
        const user_data = await prisma.user.findFirst({ where: { email: data.login, password: data.password } })
        if (user_data) return new User(user_data)

        return null
    }

    static async findById(id: string) {
        const data = await prisma.user.findFirst({ where: { id } })
        if (data) return new User(data)
        return null
    }

    static async findByEmail(email: string) {
        const data = await prisma.user.findFirst({ where: { email } })
        if (data) return new User(data)
        return null
    }

    static async getUsersFromWashimaId(washima_id: string) {
        const data = await prisma.user.findMany({ where: { washimas: { some: { id: washima_id } } } })
        return data.map((item) => new User(item))
    }

    constructor(data: UserPrisma) {
        this.id = data.id
        this.name = data.name
        this.email = data.email
        this.password = data.password
        this.admin = data.admin
    }

    load(data: UserPrisma) {
        this.id = data.id
        this.name = data.name
        this.email = data.email
        this.password = data.password
        this.admin = data.admin
    }

    async update(data: Partial<User>) {
        const updated = await prisma.user.update({
            where: { id: this.id },
            data: {
                admin: data.admin,
                email: data.email,
                name: data.name,
                password: data.password,
            },
        })

        this.load(updated)
    }

    getWashimas() {
        const washimas = Washima.washimas.filter((washima) => washima.users.find((user) => user.id === this.id))
        return washimas
    }

    async getWashimasCount() {
        const washimas = await prisma.washima.count({ where: { users: { some: { id: this.id } } } })
        return washimas
    }

    async getUnrepliedCount() {
        const washimas = this.getWashimas()
        const count = washimas.reduce((total, washima) => {
            const chats = washima.chats.filter((chat) => chat.unreadCount > 0)
            return total + chats.length
        }, 0)

        return count
    }

    async getTotalStorage() {
        const washimas = this.getWashimas()
        const total_size = (
            await Promise.all(
                washimas.map(async (washima) => {
                    const metrics = await washima.getDiskUsage(false)
                    return metrics.media + metrics.messages
                })
            )
        ).reduce((total, current) => total + current, 0)

        return numeral(total_size).format("0.00 b")
    }

    async getNagazapsCount() {
        const nagazaps = await prisma.nagazap.count({ where: { user: { id: this.id } } })
        return nagazaps
    }

    async getNagazaps() {
        const nagazaps = await prisma.nagazap.findMany({ where: { user: { id: this.id } }, include: nagazap_include })
        return nagazaps.map((item) => new Nagazap(item))
    }

    async getNagazapsTemplatesCount() {
        const nagazaps = await this.getNagazaps()
        const templates = (
            await Promise.all(
                nagazaps.map(async (nagazap) => {
                    const nagazap_templates = await nagazap.getTemplates()
                    return nagazap_templates.length as number
                })
            )
        ).reduce((total, templates) => templates + total, 0)
        return templates
    }

    async getNagazapsLogsCount() {
        const nagazaps = await this.getNagazaps()
        const success = nagazaps.reduce((total, nagazap) => nagazap.sentMessages.length + total, 0)
        const error = nagazaps.reduce((total, nagazap) => nagazap.failedMessages.length + total, 0)
        return { success, error }
    }

    async getBakingMessagesCount() {
        const nagazaps = await this.getNagazaps()
        const count = nagazaps.reduce((total, nagazap) => nagazap.stack.length + total, 0)
        return count
    }

    async getBlacklistedCount() {
        const nagazaps = await this.getNagazaps()
        const count = nagazaps.reduce((total, nagazap) => nagazap.blacklist.length + total, 0)
        return count
    }
}
