import { NextFunction, Request, Response } from "express"

export const requireUserId = (request: Request, response: Response, next: NextFunction) => {
    const { user_id } = request.query

    if (!user_id) {
        return response.status(400).send("user_id param is required")
    }

    next()
}
