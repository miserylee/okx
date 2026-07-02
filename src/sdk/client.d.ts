export type OkxEnv = "sandbox" | "live";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface OkxRecord {
  [key: string]: unknown;
}

export interface ConnectOkxDaemonOptions {
  env: OkxEnv;
  source: string;
  timeoutMs?: number;
}

export interface OkxDaemonClientOptions extends ConnectOkxDaemonOptions {
  name: string;
  baseUrl: string;
}

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  unwrap?: boolean;
  context?: boolean;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DaemonEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface HealthStatus {
  ok: true;
  name: string;
  state: DaemonState;
  version: string;
}

export interface DaemonStateResult {
  state: DaemonState;
  name: string;
  version: string;
}

export type DaemonState = "active" | "paused";

export interface Instrument extends OkxRecord {
  instType?: string;
  instId: string;
  baseCcy?: string;
  quoteCcy?: string;
  tickSz?: string;
  lotSz?: string;
  minSz?: string;
  state?: string;
}

export interface InstrumentQuery extends QueryParams {
  instType?: string;
  instId?: string;
  uly?: string;
  instFamily?: string;
}

export interface Ticker extends OkxRecord {
  instId: string;
  last?: string;
  bidPx?: string;
  askPx?: string;
  ts?: string;
}

export type Candle = OkxRecord | string[];

export interface CandleOptions extends QueryParams {
  bar?: string;
  limit?: string | number;
}

export interface BookSideLevel extends Array<string> {
  0: string;
  1: string;
}

export interface OrderBook extends OkxRecord {
  instId?: string;
  asks: BookSideLevel[];
  bids: BookSideLevel[];
  ts?: string;
}

export interface MarketTrade extends OkxRecord {
  instId?: string;
  tradeId?: string;
  px?: string;
  sz?: string;
  side?: string;
  ts?: string;
}

export interface FundingRate extends OkxRecord {
  instId: string;
  fundingRate?: string;
  nextFundingRate?: string;
  fundingTime?: string;
  ts?: string;
}

export interface OpenInterest extends OkxRecord {
  instType?: string;
  instId?: string;
  oi?: string;
  oiCcy?: string;
  ts?: string;
}

export interface MarkPrice extends OkxRecord {
  instType?: string;
  instId?: string;
  markPx?: string;
  ts?: string;
}

export interface IndexTicker extends OkxRecord {
  instId?: string;
  idxPx?: string;
  high24h?: string;
  low24h?: string;
  ts?: string;
}

export interface BalanceDetail extends OkxRecord {
  ccy: string;
  availBal?: string;
  availEq?: string;
  cashBal?: string;
  eq?: string;
  eqUsd?: string;
  frozenBal?: string;
  ordFrozen?: string;
}

export interface Balance extends OkxRecord {
  totalEq?: string | null;
  details: BalanceDetail[];
}

export interface AvailableBalance extends Balance {}

export interface Position extends OkxRecord {
  instType?: string;
  instId?: string;
  pos?: string;
  avgPx?: string;
  upl?: string;
  mgnMode?: string;
}

export interface Bill extends OkxRecord {
  billId?: string;
  ccy?: string;
  balChg?: string;
  fee?: string;
  type?: string;
  subType?: string;
  ts?: string;
}

export interface MaxSize extends OkxRecord {
  instId?: string;
  tdMode?: string;
  maxBuy?: string;
  maxSell?: string;
}

export interface MaxAvailSize extends OkxRecord {
  instId?: string;
  tdMode?: string;
  availBuy?: string;
  availSell?: string;
}

export interface FeeRates extends OkxRecord {
  instType?: string;
  instId?: string;
  maker?: string;
  taker?: string;
}

export type OrderSide = "buy" | "sell" | (string & {});
export type OrderType = "market" | "limit" | "post_only" | "fok" | "ioc" | "optimal_limit_ioc" | (string & {});

export interface Order extends OkxRecord {
  instId: string;
  ordId?: string;
  clOrdId?: string;
  side?: OrderSide;
  ordType?: OrderType;
  sz?: string;
  px?: string;
  state?: string;
  ts?: string;
}

export interface OrderQuery extends QueryParams {
  instType?: string;
  instId?: string;
  state?: string;
  ordId?: string;
  clOrdId?: string;
  after?: string;
  before?: string;
  limit?: string | number;
}

export interface OrderIdentity extends OkxRecord {
  instId: string;
  ordId?: string;
  clOrdId?: string;
}

export interface PlaceOrderRequest extends OkxRecord {
  instId: string;
  side: OrderSide;
  ordType: OrderType;
  sz: string;
  tdMode?: string;
  px?: string;
  clOrdId?: string;
}

export interface AmendOrderRequest extends OrderIdentity {
  newSz?: string;
  newPx?: string;
  cxlOnFail?: string | boolean;
  reqId?: string;
}

export interface AlgoOrder extends OkxRecord {
  instId: string;
  algoId?: string;
  algoClOrdId?: string;
  ordType?: string;
  side?: OrderSide;
  sz?: string;
  state?: string;
  tpTriggerPx?: string;
  tpOrdPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
}

export interface AlgoOrderQuery extends QueryParams {
  instType?: string;
  instId?: string;
  ordType?: string;
  state?: string;
  algoId?: string;
  algoClOrdId?: string;
  after?: string;
  before?: string;
  limit?: string | number;
}

export interface PlaceAlgoOrderRequest extends OkxRecord {
  instId: string;
  side: OrderSide;
  sz: string;
  ordType?: string;
  tdMode?: string;
  algoClOrdId?: string;
  tpTriggerPx?: string;
  tpOrdPx?: string;
  tpTriggerPxType?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
  slTriggerPxType?: string;
  triggerPx?: string;
  orderPx?: string;
  triggerPxType?: string;
}

export interface TakeProfitOrderRequest extends Omit<PlaceAlgoOrderRequest, "tpTriggerPx" | "tpOrdPx"> {
  triggerPx?: string;
  orderPx?: string;
  tpTriggerPx?: string;
  tpOrdPx?: string;
}

export interface StopLossOrderRequest extends Omit<PlaceAlgoOrderRequest, "slTriggerPx" | "slOrdPx"> {
  triggerPx?: string;
  orderPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
}

export interface TpSlOrderRequest extends PlaceAlgoOrderRequest {
  tpTriggerPx: string;
  slTriggerPx: string;
}

export interface AmendAlgoOrderRequest extends OkxRecord {
  instId: string;
  algoId?: string;
  algoClOrdId?: string;
  ordType?: string;
  newSz?: string;
  newTpTriggerPx?: string;
  newTpOrdPx?: string;
  newTpTriggerPxType?: string;
  newSlTriggerPx?: string;
  newSlOrdPx?: string;
  newSlTriggerPxType?: string;
  newTriggerPx?: string;
  newOrderPx?: string;
  newTriggerPxType?: string;
}

export interface CancelAlgoOrderRequest extends OkxRecord {
  instId: string;
  algoId?: string;
  algoClOrdId?: string;
  ordType?: string;
}

export interface CancelAllAfterResult extends OkxRecord {
  triggerTime?: string;
  ts?: string;
  timeOut?: string;
}

export interface ClosePositionRequest extends OkxRecord {
  instId: string;
  mgnMode: string;
  posSide?: string;
  ccy?: string;
  autoCxl?: boolean | string;
}

export interface Fill extends OkxRecord {
  instId?: string;
  ordId?: string;
  tradeId?: string;
  side?: string;
  fillSz?: string;
  fillPx?: string;
  fee?: string;
  feeCcy?: string;
  ts?: string;
}

export interface FillQuery extends QueryParams {
  instType?: string;
  instId?: string;
  ordId?: string;
  after?: string;
  before?: string;
  limit?: string | number;
}

export interface AuditRecord extends OkxRecord {
  env: OkxEnv | null;
  source: string;
  kind: string;
  method?: string;
  path?: string;
  request?: OkxRecord;
  result?: JsonValue;
  error?: {
    code: string;
    message: string;
  } | null;
  latencyMs?: number;
  timestamp?: string;
}

export interface AuditRecentResult {
  records: AuditRecord[];
}

export interface PrivateChannelArg extends OkxRecord {
  channel: string;
  instType?: string;
}

export interface PrivateStreamStatus extends OkxRecord {
  env: OkxEnv;
  status: "connecting" | "authenticating" | "subscribing" | "active" | "closing" | "closed" | "stopped" | "error" | (string & {});
  channels?: PrivateChannelArg[];
  startedAt?: string;
  lastEventAt?: string | null;
  lastError?: JsonValue;
}

export interface SseEvent<TData = unknown> {
  type: string;
  timestamp: string;
  env: OkxEnv | null;
  source: string;
  data: TData;
}

export interface SubscribeOptions {
  signal?: AbortSignal;
}

export interface InstrumentsApi {
  list(query?: InstrumentQuery): Promise<Instrument[]>;
  get(instId: string, query?: InstrumentQuery): Promise<Instrument | null>;
}

export interface MarketApi {
  ticker(instId: string): Promise<Ticker | null>;
  candles(instId: string, options?: CandleOptions): Promise<Candle[]>;
  books(instId: string, options?: QueryParams): Promise<OrderBook | null>;
  trades(instId: string, options?: QueryParams): Promise<MarketTrade[]>;
  tradesHistory(instId: string, options?: QueryParams): Promise<MarketTrade[]>;
  fundingRate(instId: string): Promise<FundingRate | null>;
  fundingRateHistory(instId: string, options?: QueryParams): Promise<FundingRate[]>;
  openInterest(query?: InstrumentQuery): Promise<OpenInterest[]>;
  markPrice(query?: InstrumentQuery): Promise<MarkPrice[]>;
  indexTickers(query?: QueryParams): Promise<IndexTicker[]>;
}

export interface AccountApi {
  balance(): Promise<Balance | null>;
  positions(query?: QueryParams): Promise<Position[]>;
  available(query?: QueryParams): Promise<AvailableBalance>;
  bills(query?: QueryParams): Promise<Bill[]>;
  maxSize(query?: QueryParams): Promise<MaxSize | null>;
  maxAvailSize(query?: QueryParams): Promise<MaxAvailSize | null>;
  feeRates(query?: QueryParams): Promise<FeeRates | null>;
}

export interface OrdersApi {
  open(query?: OrderQuery): Promise<Order[]>;
  history(query?: OrderQuery): Promise<Order[]>;
  get(query: OrderIdentity): Promise<Order | null>;
  preview(order: PlaceOrderRequest): Promise<OkxRecord>;
  place(order: PlaceOrderRequest): Promise<Order | null>;
  amend(order: AmendOrderRequest): Promise<Order | null>;
  cancel(order: OrderIdentity): Promise<Order | null>;
  batch: {
    place(orders: PlaceOrderRequest[]): Promise<Order[]>;
    amend(orders: AmendOrderRequest[]): Promise<Order[]>;
    cancel(orders: OrderIdentity[]): Promise<Order[]>;
  };
  cancelAllAfter(timeOut: string | number): Promise<CancelAllAfterResult | null>;
  closePosition(position: ClosePositionRequest): Promise<OkxRecord | null>;
  algo: {
    open(query?: AlgoOrderQuery): Promise<AlgoOrder[]>;
    history(query?: AlgoOrderQuery): Promise<AlgoOrder[]>;
    get(query: AlgoOrderQuery): Promise<AlgoOrder | null>;
    place(order: PlaceAlgoOrderRequest): Promise<AlgoOrder | null>;
    amend(order: AmendAlgoOrderRequest): Promise<AlgoOrder | null>;
    cancel(order: CancelAlgoOrderRequest): Promise<AlgoOrder[]>;
  };
  placeMarketBuy(instId: string, amount: string, extra?: Partial<PlaceOrderRequest>): Promise<Order | null>;
  placeTakeProfit(order: TakeProfitOrderRequest): Promise<AlgoOrder | null>;
  placeStopLoss(order: StopLossOrderRequest): Promise<AlgoOrder | null>;
  placeTpSl(order: TpSlOrderRequest): Promise<AlgoOrder | null>;
}

export interface ControlApi {
  pause(reason?: string): Promise<{ state: DaemonState }>;
  resume(reason?: string): Promise<{ state: DaemonState }>;
}

export interface FillsApi {
  list(query?: FillQuery): Promise<Fill[]>;
  history(query?: FillQuery): Promise<Fill[]>;
}

export interface AuditApi {
  recent(query?: QueryParams): Promise<AuditRecentResult>;
}

export interface StreamsApi {
  private: {
    start(channels?: PrivateChannelArg[]): Promise<PrivateStreamStatus>;
    status(): Promise<PrivateStreamStatus>;
    stop(): Promise<PrivateStreamStatus>;
  };
}

export interface EventsApi {
  subscribe<TData = unknown>(
    onEvent: (event: SseEvent<TData>) => void,
    options?: SubscribeOptions,
  ): Promise<void>;
}

export declare function connectOkxDaemon(
  name: string,
  options: ConnectOkxDaemonOptions,
): Promise<OkxDaemonClient>;

export declare class OkxDaemonClient {
  constructor(options: OkxDaemonClientOptions);

  readonly name: string;
  readonly env: OkxEnv;
  readonly source: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;

  readonly instruments: InstrumentsApi;
  readonly market: MarketApi;
  readonly account: AccountApi;
  readonly orders: OrdersApi;
  readonly control: ControlApi;
  readonly fills: FillsApi;
  readonly audit: AuditApi;
  readonly streams: StreamsApi;
  readonly events: EventsApi;

  health(): Promise<HealthStatus>;
  state(): Promise<DaemonStateResult>;
  request<T = unknown>(
    method: HttpMethod,
    pathname: string,
    options?: RequestOptions,
  ): Promise<T>;
  subscribe<TData = unknown>(
    onEvent: (event: SseEvent<TData>) => void,
    options?: SubscribeOptions,
  ): Promise<void>;
}
