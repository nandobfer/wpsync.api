import express, { Express, Request, Response } from "express"
import { User, UserForm } from "../../class/User"
import login from "./login"
import stats from "./stats"

const router = express.Router()

router.use("/login", login)
router.use("/stats", stats)

router.post("/", async (request: Request, response: Response) => {
    const data = request.body as UserForm

    try {
        const user = await User.new(data)
        console.log(user)
        response.json(user)
    } catch (error) {
        console.log(error)
        response.status(500).send(error)
    }
})

router.get("/make-admin", async (request: Request, response: Response) => {
    const email = request.query.email as string | undefined
    console.log(email)

    if (email) {
        try {
            const user = await User.findByEmail(email)
            if (user) {
                await user.update({ admin: true })
                response.json(user)
            } else {
                response.status(404).send("user not found")
            }
        } catch (error) {
            console.log(error)
            response.status(500).send(error)
        }
    } else {
        response.status(400).send("email param is required")
    }
})

export default router
