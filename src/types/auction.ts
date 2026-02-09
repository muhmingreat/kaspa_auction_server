// Kaspa Live Auction Engine - Type Definitions

export type BidStatus = 'pending' | 'detected' | 'confirmed'

export type AuctionStatus = 'live' | 'ending-soon' | 'ended' | 'upcoming'

export interface Bid {
    id: string
    auctionId: string
    bidderAddress: string
    bidderName?: string
    amount: number // in KAS
    timestamp: Date
    status: BidStatus
    txHash?: string
    confirmationTime?: number // milliseconds
}

export interface Auction {
    id: string
    title: string
    description: string
    imageUrl: string
    images?: string[]
    seller: {
        address: string
        name?: string
        avatar?: string
        verified?: boolean
    }
    startPrice: number // in KAS
    currentPrice: number // in KAS
    reservePrice?: number // in KAS
    minimumIncrement: number // in KAS
    startTime: Date
    endTime: Date
    status: AuctionStatus
    bids: Bid[]
    bidCount: number
    highestBidder?: {
        address: string
        name?: string
    }
    category?: string
    tags?: string[]
    featured?: boolean
}

export interface WalletState {
    connected: boolean
    address?: string
    allAccounts?: string[]
    balance?: number // in KAS
    name?: string
}

export interface BidFormData {
    amount: number
    auctionId: string
}

export interface CreateAuctionFormData {
    title: string
    description: string
    imageUrl: string
    startPrice: number
    reservePrice?: number
    duration: number // in hours
    category?: string
}

// API Response Types
export interface AuctionResponse {
    success: boolean
    data?: Auction
    error?: string
}

export interface BidResponse {
    success: boolean
    data?: Bid
    error?: string
    txHash?: string
}

// WebSocket Event Types
export interface BidEvent {
    type: 'new_bid' | 'bid_confirmed' | 'bid_detected'
    auctionId: string
    bid: Bid
}

export interface AuctionEvent {
    type: 'auction_started' | 'auction_ended' | 'price_update'
    auction: Auction
}

// Filter and Sort Types
export type AuctionSortBy = 'ending-soon' | 'price-low' | 'price-high' | 'newest' | 'most-bids'

export interface AuctionFilters {
    status?: AuctionStatus[]
    category?: string[]
    priceMin?: number
    priceMax?: number
    searchQuery?: string
}
