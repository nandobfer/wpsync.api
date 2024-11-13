export interface SentMessageLog {
    timestamp: string
    data: {
        messaging_product: "whatsapp"
        contacts: [{ input: string; wa_id: string }]
        messages: [{ id: string; message_status: string }]
    }
}

export interface FailedMessageLog {
    timestamp: string
    data: {
        error: {
            message: "(#131026) Message undeliverable"
            type: "OAuthException"
            code: 131026
            fbtrace_id: "ASFad0NQe8jqYbKm5RQWvhA"
        }
    }
    number: string
}

export interface BlacklistLog {
    timestamp: string
    number: string
}