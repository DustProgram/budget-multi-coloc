export type EventType =
  | 'income'
  | 'charge'
  | 'transfer_in'
  | 'transfer_out'
  | 'saving_in'
  | 'saving_out'
  | 'purchase';

export type SourceKind =
  | 'income'
  | 'charge'
  | 'recurring_transfer'
  | 'onetime_transfer'
  | 'saving'
  | 'purchase';

export interface CalendarEvent {
  date: string;
  type: EventType;
  label: string;
  amount: string;
  account_id: number;
  account_name: string;
  source_kind: SourceKind;
  source_id: number;
  balance_after: string;
}

export interface AccountProjection {
  account_id: number;
  name: string;
  starting_balance: string;
  projected_end_balance: string;
}

export interface UpcomingResponse {
  from_date: string;
  to_date: string;
  events: CalendarEvent[];
  accounts: AccountProjection[];
}
