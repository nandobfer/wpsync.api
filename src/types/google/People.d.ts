declare interface People {
    googleId?: string | null
    name?: string | null
    emails?: string[]
    photo?: string | null

    birthday?: {
        year?: number | null
        month?: number | null
        day?: number | null
    } | null

    phone?: string | null
}
