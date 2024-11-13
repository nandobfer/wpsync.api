export interface MessageWebhook {
    object: "whatsapp_business_account"
    entry: [
        {
            id: string // businessId
            changes: [
                {
                    value: {
                        messaging_product: "whatsapp"
                        metadata: {
                            display_phone_number: string // nosso number
                            phone_number_id: string
                        }
                        contacts: [
                            {
                                profile: {
                                    name: string // nome do contato
                                }
                                wa_id: string // numero do contato
                            }
                        ]
                        messages: [
                            {
                                from: string // remetente
                                id: string
                                timestamp: string // unix timestamp, multiply by 1000 to get javascript timestamp
                                context?: {
                                    from: string
                                    id: string
                                }
                                text?: {
                                    body: string // message text
                                }
                                button?: { payload: string; text: string }
                                reaction?: {
                                    message_id: string
                                    emoji: string
                                }
                                sticker?: {
                                    mime_type: "image/webp"
                                    sha256: string
                                    id: string
                                    animated: boolean
                                }
                                image?: {
                                    mime_type: "image/jpeg"
                                    sha256: string
                                    id: string
                                }
                                video?: {
                                    mime_type: string
                                    sha256: string
                                    id: string
                                }
                                audio?: {
                                    mime_type: string
                                    id: string
                                }
                                type: NagaMessageType
                            }
                        ]
                    }
                    field: string
                }
            ]
        }
    ]
}
