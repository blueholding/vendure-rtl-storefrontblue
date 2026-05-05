// ─── Vendure Client with Bearer Token (Cookie-based) ──────────────────────────
const VENDURE_API = process.env.NEXT_PUBLIC_VENDURE_API || 'https://bramjlive.com/shop-api'
const TOKEN_KEY = 'vendure_token'

// ── Cookie helpers (work on both client & server) ──
function getTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + TOKEN_KEY + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch { return null }
}

function saveTokenToCookie(token: string | null) {
  if (typeof document === 'undefined' || !token) return
  try {
    // الكوكي بيفضل شغال 30 يوم
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Lax; Secure`
  } catch {}
}

// ── للقراءة من الـ request على السيرفر (Server Actions / Route Handlers) ──
export function getTokenFromRequestCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  try {
    const match = cookieHeader.match(new RegExp('(?:^|; )' + TOKEN_KEY + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch { return null }
}

export async function vendureFetch<T = any>(
  query: string,
  variables: Record<string, any> = {},
  cookieHeader?: string | null, // للاستخدام من السيرفر
): Promise<T> {
  // جرب تجيب الـ token من الكوكي (client أو server)
  const token = cookieHeader
    ? getTokenFromRequestCookie(cookieHeader)
    : getTokenFromCookie()

  const res = await fetch(VENDURE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store', // مهم عشان Next.js ما يعملش cache للـ cart requests
  })

  // ── احفظ الـ token الجديد لو Vendure بعته ──
  const newToken =
    res.headers.get('vendure-auth-token') ||
    res.headers.get('Vendure-Auth-Token')
  if (newToken) {
    saveTokenToCookie(newToken)
  }

  const json = await res.json()

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'GraphQL Error')
  }

  return json.data as T
}

// Server-side only (no token needed)
import { GraphQLClient } from 'graphql-request'
export const gqlClient = new GraphQLClient(VENDURE_API, {
  headers: { 'Content-Type': 'application/json' },
})

// ─── Queries ───────────────────────────────────────────────────────────────────
export const GET_COLLECTIONS = `
  query GetCollections {
    collections(options: { topLevelOnly: true }) {
      items { id name slug featuredAsset { preview } }
    }
  }
`

export const GET_PRODUCTS = `
  query GetProducts($take: Int, $skip: Int, $sort: ProductSortParameter) {
    products(options: { take: $take skip: $skip sort: $sort filter: { enabled: { eq: true } } }) {
      totalItems
      items {
        id name slug description
        featuredAsset { preview }
        variants { id price currencyCode stockLevel }
        collections { slug name }
      }
    }
  }
`

export const GET_PRODUCT_BY_SLUG = `
  query GetProduct($slug: String!) {
    product(slug: $slug) {
      id name slug description
      featuredAsset { preview }
      assets { preview }
      variants { id name price currencyCode stockLevel options { name groupId } }
      collections { slug name }
    }
  }
`

export const SEARCH_PRODUCTS = `
  query Search($term: String!) {
    search(input: { term: $term, take: 12, groupByProduct: true }) {
      items {
        productId productName slug
        productAsset { preview }
        priceWithTax {
          ... on SinglePrice { value }
          ... on PriceRange { min max }
        }
      }
    }
  }
`

export const ADD_TO_CART = `
  mutation AddToCart($variantId: ID!, $quantity: Int!) {
    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
      __typename
      ... on Order {
        id totalWithTax
        lines {
          id quantity linePriceWithTax
          productVariant {
            id name
            product { name slug featuredAsset { preview } }
          }
        }
      }
      ... on ErrorResult { errorCode message }
    }
  }
`

export const GET_ACTIVE_ORDER = `
  query GetOrder {
    activeOrder {
      id totalWithTax subTotalWithTax shippingWithTax
      lines {
        id quantity linePriceWithTax
        productVariant {
          id name price
          product { name slug featuredAsset { preview } }
        }
      }
    }
  }
`

export const REMOVE_FROM_CART = `
  mutation RemoveFromCart($lineId: ID!) {
    removeOrderLine(orderLineId: $lineId) {
      __typename
      ... on Order { id totalWithTax lines { id quantity } }
      ... on ErrorResult { errorCode message }
    }
  }
`

export const ADJUST_QTY = `
  mutation AdjustQty($lineId: ID!, $quantity: Int!) {
    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
      __typename
      ... on Order { id totalWithTax lines { id quantity linePriceWithTax } }
      ... on ErrorResult { errorCode message }
    }
  }
`

export const SET_CUSTOMER = `
  mutation SetCustomer($input: CreateCustomerInput!) {
    setCustomerForOrder(input: $input) {
      __typename
      ... on Order { id }
      ... on ErrorResult { errorCode message }
    }
  }
`

export const SET_SHIPPING_ADDRESS = `
  mutation SetShippingAddress($input: CreateAddressInput!) {
    setOrderShippingAddress(input: $input) {
      __typename
      ... on Order { id state }
      ... on ErrorResult { errorCode message }
    }
  }
`

export const GET_SHIPPING_METHODS = `
  query GetShippingMethods {
    eligibleShippingMethods { id name description priceWithTax }
  }
`

export const SET_SHIPPING_METHOD = `
  mutation SetShippingMethod($id: [ID!]!) {
    setOrderShippingMethod(shippingMethodId: $id) {
      __typename
      ... on Order { id shippingWithTax }
      ... on ErrorResult { errorCode message }
    }
  }
`

export const TRANSITION_ORDER = `
  mutation TransitionOrder($state: String!) {
    transitionOrderToState(state: $state) {
      __typename
      ... on Order { id state code }
      ... on OrderStateTransitionError { errorCode message transitionError }
    }
  }
`

export const ADD_PAYMENT = `
  mutation AddPayment($input: PaymentInput!) {
    addPaymentToOrder(input: $input) {
      __typename
      ... on Order { id state code }
      ... on ErrorResult { errorCode message }
      ... on PaymentFailedError { errorCode message paymentErrorMessage }
      ... on PaymentDeclinedError { errorCode message paymentErrorMessage }
      ... on OrderStateTransitionError { errorCode message transitionError }
      ... on NoActiveOrderError { errorCode message }
    }
  }
`

export function formatPrice(value: number, currency = 'EGP') {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency', currency, minimumFractionDigits: 0,
  }).format(value / 100)
}
