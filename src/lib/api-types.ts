/**
 * Client-side TypeScript types mirroring the JSON shapes actually returned
 * by the existing API routes (see src/app/api/**\/route.ts and their
 * underlying src/modules/**\/*.service.ts). These are intentionally
 * hand-written rather than imported from Prisma, since API responses go
 * through JSON serialization (Date -> string) and DTO shaping
 * (toPublicUser strips passwordHash, etc.) that differ from the raw Prisma
 * model types.
 */

export type { AppLocale } from "@/i18n/config";

export type Role =
  | "CUSTOMER"
  | "RESTAURANT_OWNER"
  | "RESTAURANT_STAFF"
  | "COURIER"
  | "SUPPORT"
  | "ADMIN"
  | "SUPER_ADMIN";

export interface PublicUser {
  id: string;
  phone: string;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  locale: "UZ" | "RU" | "EN";
  status: string;
  roles: Role[];
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Region {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  latitude: number | null;
  longitude: number | null;
}

export interface City {
  id: string;
  regionId: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  latitude: number | null;
  longitude: number | null;
}

export interface District {
  id: string;
  cityId: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
}

export interface Address {
  id: string;
  userId: string;
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  regionId: string;
  cityId: string;
  districtId: string | null;
  addressLine: string;
  street: string | null;
  building: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  deliveryInstructions: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  region: Region;
  city: City;
  district: District | null;
}

export type DeliveryZoneType = "RADIUS" | "POLYGON";

export interface DeliveryZone {
  id: string;
  branchId: string;
  name: string;
  type: DeliveryZoneType;
  radiusMeters: number | null;
  polygon: unknown;
  isActive: boolean;
  baseFee: number;
  perKmFee: number;
  minOrderAmount: number;
  maxDeliveryDistanceMeters: number | null;
  estimatedMinMinutes: number;
  estimatedMaxMinutes: number;
}

export interface OpeningHours {
  mon: [string, string][];
  tue: [string, string][];
  wed: [string, string][];
  thu: [string, string][];
  fri: [string, string][];
  sat: [string, string][];
  sun: [string, string][];
}

export interface RestaurantBranch {
  id: string;
  restaurantId: string;
  name: string;
  addressLine: string;
  regionId: string;
  cityId: string;
  districtId: string | null;
  latitude: number;
  longitude: number;
  phone: string;
  isActive: boolean;
  openingHours: OpeningHours;
  temporarilyClosedUntil: string | null;
  deliveryZones?: DeliveryZone[];
}

export interface RestaurantCategory {
  id: string;
  slug: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  iconUrl: string | null;
  sortOrder: number;
}

export interface RestaurantCategoryLink {
  restaurantId: string;
  categoryId: string;
  category: RestaurantCategory;
}

export type RestaurantStatus = "PENDING" | "APPROVED" | "SUSPENDED" | "ARCHIVED";

export interface Restaurant {
  id: string;
  slug: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: RestaurantStatus;
  commissionBps: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
  branches: RestaurantBranch[];
  categoryLinks: RestaurantCategoryLink[];
  distanceMeters?: number | null;
}

export interface RestaurantListResponse {
  items: Restaurant[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  productId: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  priceDelta: number;
  isDefault: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ModifierOption {
  id: string;
  modifierGroupId: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  priceDelta: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  productId: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  restaurantId: string;
  menuCategoryId: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  basePrice: number;
  discountedPrice: number | null;
  isAvailable: boolean;
  sortOrder: number;
  images: ProductImage[];
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
}

export interface MenuCategoryWithProducts extends MenuCategory {
  products: Product[];
}

export interface RestaurantMenuResponse {
  menuCategories: MenuCategoryWithProducts[];
}

export interface CartItemModifier {
  id: string;
  cartItemId: string;
  modifierOptionId: string;
  modifierOption: ModifierOption;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  notes: string | null;
  product: Product;
  variant: ProductVariant | null;
  modifiers: CartItemModifier[];
}

export interface Cart {
  id: string;
  userId: string;
  restaurantId: string;
  notes: string | null;
  items: CartItem[];
  restaurant: { id: string; slug: string; nameUz: string; nameRu: string; nameEn: string };
}

export interface PricedLine {
  unitBasePrice: number;
  unitFinalPrice: number;
  quantity: number;
  lineTotal: number;
  cartItemId: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  modifierOptionIds: string[];
}

export interface PricedCartSummary {
  lines: PricedLine[];
  subtotalAmount: number;
}

export interface CartResponse {
  cart: Cart | null;
  pricing: PricedCartSummary;
}

export type PaymentMethod = "CASH" | "ONLINE";

export type OrderStatus =
  | "PENDING"
  | "PAYMENT_PENDING"
  | "PAID"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "COURIER_ASSIGNED"
  | "PICKED_UP"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export interface OrderItemModifierSnapshot {
  id: string;
  orderItemId: string;
  modifierOptionId: string;
  modifierOptionNameSnapshot: string;
  priceDelta: number;
}

export interface OrderItemSnapshot {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  unitBasePrice: number;
  unitFinalPrice: number;
  quantity: number;
  notes: string | null;
  lineTotal: number;
  modifiers: OrderItemModifierSnapshot[];
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  status: OrderStatus;
  actorUserId: string | null;
  actorRole: Role | null;
  reason: string | null;
  createdAt: string;
}

export interface AddressSnapshot {
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  street: string | null;
  building: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  region: string;
  city: string;
  district: string | null;
  latitude: number;
  longitude: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  restaurantId: string;
  branchId: string;
  deliveryZoneId: string | null;
  addressId: string | null;
  addressSnapshot: AddressSnapshot;
  recipientName: string;
  recipientPhone: string;
  deliveryInstructions: string | null;
  latitude: number;
  longitude: number;
  subtotalAmount: number;
  discountAmount: number;
  deliveryFeeAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
  restaurantEarningsAmount: number;
  platformCommissionAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  promoCodeId: string | null;
  placedAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemSnapshot[];
  restaurant: {
    id: string;
    slug: string;
    nameUz: string;
    nameRu: string;
    nameEn: string;
    logoUrl: string | null;
  };
  branch: { id: string; name: string; phone: string };
  statusHistory: OrderStatusHistoryEntry[];
}

export interface OrderListResponse {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InitiatePaymentResult {
  redirectUrl: string;
  providerReference?: string;
}
