export interface BusinessInfo {
    id: string // businessId
    name: string
    phone_numbers: {
        data: {
            verified_name: string // nome do whatsapp
            code_verification_status: string
            display_phone_number: string // numero do whatsapp
            quality_rating: string
            platform_type: string
            throughput: {
                level: string
            }
            id: string // phoneId
        }[]
    }
}
