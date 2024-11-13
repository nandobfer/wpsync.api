import express, { Express, Request, Response } from "express"
import { requireUserId } from "../../middlewares/requireUserId"
import { User } from "../../class/User"
const router = express.Router()

router.use(requireUserId)

router.get("/count", async (request: Request, response: Response) => {
    const user_id = request.query.user_id as string
    try {
        const user = await User.findById(user_id)
        const count = await user?.getNagazapsCount()
        response.json(count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/templates", async (request: Request, response: Response) => {
    const user_id = request.query.user_id as string
    try {
        const user = await User.findById(user_id)
        const count = await user?.getNagazapsTemplatesCount()
        response.json(count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/messages", async (request: Request, response: Response) => {
    const user_id = request.query.user_id as string
    try {
        const user = await User.findById(user_id)
        const count = await user?.getNagazapsLogsCount()
        response.json(count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/oven", async (request: Request, response: Response) => {
    const user_id = request.query.user_id as string
    try {
        const user = await User.findById(user_id)
        const count = await user?.getBakingMessagesCount()
        response.json(count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/blacklist", async (request: Request, response: Response) => {
    const user_id = request.query.user_id as string
    try {
        const user = await User.findById(user_id)
        const count = await user?.getBlacklistedCount()
        response.json(count)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

export default router
