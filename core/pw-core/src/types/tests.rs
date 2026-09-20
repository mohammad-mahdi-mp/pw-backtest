//! Contract tests for the frozen §1.1 types: serde shapes, round-trips,
//! `Copy`/`PartialEq` semantics. The JSON strings asserted here are byte-level
//! examples of the wire format the fixtures and IPC layer depend on.

use super::*;
use serde_json::{Value, json};

fn roundtrip<T: serde::Serialize + serde::de::DeserializeOwned>(v: &T) -> T {
    let s = serde_json::to_string(v).expect("serialize");
    serde_json::from_str(&s).expect("deserialize")
}

#[test]
fn bar_json_field_names_are_contract_exact() {
    let bar = Bar { time: 1_700_000_000_000, open: 60_000.0, high: 60_100.0, low: 59_900.0, close: 60_050.0, volume: 12.5 };
    let v: Value = serde_json::to_value(&bar).expect("to value");
    let obj = v.as_object().expect("object");
    let keys: Vec<_> = obj.keys().copied().collect();
    assert_eq!(keys, vec!["time", "open", "high", "low", "close", "volume"]);
}

#[test]
fn bar_serde_roundtrip() {
    let bar = Bar { time: 1, open: 2.5, high: 3.5, low: 1.5, close: 3.0, volume: 0.0 };
    assert_eq!(roundtrip(&bar), bar);
}

#[test]
fn bar_is_copy_and_partial_eq() {
    let a = Bar { time: 7, open: 1.0, high: 2.0, low: 0.5, close: 1.5, volume: 3.0 };
    let b = a; // Copy — `a` stays usable
    assert_eq!(a, b);
    assert_eq!(a.time, 7);
}

#[test]
fn tick_serde_roundtrip_and_json() {
    let tick = Tick { time: 1_700_000_000_000, price: 60_002.0, volume: 0.0 };
    let v: Value = serde_json::to_value(&tick).expect("to value");
    assert_eq!(v, json!({"time": 1_700_000_000_000i64, "price": 60002.0, "volume": 0.0}));
    assert_eq!(roundtrip(&tick), tick);
}

#[test]
fn side_json_names() {
    assert_eq!(serde_json::to_value(Side::Buy).expect("s"), json!("Buy"));
    assert_eq!(serde_json::to_value(Side::Sell).expect("s"), json!("Sell"));
    assert_eq!(roundtrip(&Side::Buy), Side::Buy);
    assert_eq!(roundtrip(&Side::Sell), Side::Sell);
}

#[test]
fn direction_json_names() {
    assert_eq!(serde_json::to_value(Direction::Long).expect("d"), json!("Long"));
    assert_eq!(serde_json::to_value(Direction::Short).expect("d"), json!("Short"));
    assert_eq!(roundtrip(&Direction::Short), Direction::Short);
}

#[test]
fn order_type_json_names() {
    for (t, name) in [
        (OrderType::Market, "Market"),
        (OrderType::Limit, "Limit"),
        (OrderType::Stop, "Stop"),
        (OrderType::StopLimit, "StopLimit"),
        (OrderType::Bracket, "Bracket"),
    ] {
        assert_eq!(serde_json::to_value(t).expect("t"), json!(name));
        assert_eq!(roundtrip(&t), t);
    }
}

#[test]
fn fill_model_json_names() {
    for (m, name) in [
        (FillModel::NextOpen, "NextOpen"),
        (FillModel::BarClose, "BarClose"),
        (FillModel::Tick, "Tick"),
    ] {
        assert_eq!(serde_json::to_value(m).expect("m"), json!(name));
        assert_eq!(roundtrip(&m), m);
    }
}

#[test]
fn tif_gtc_and_fill_and_kill_are_strings() {
    assert_eq!(serde_json::to_value(TimeInForce::Gtc).expect("t"), json!("Gtc"));
    assert_eq!(
        serde_json::to_value(TimeInForce::FillAndKill).expect("t"),
        json!("FillAndKill")
    );
}

#[test]
fn tif_gtd_is_newtype_variant() {
    let t = TimeInForce::Gtd(1_700_000_000_000);
    assert_eq!(serde_json::to_value(t).expect("t"), json!({"Gtd": 1_700_000_000_000i64}));
    assert_eq!(roundtrip(&t), t);
}

#[test]
fn fill_reason_json_names() {
    for (r, name) in [
        (FillReason::Market, "Market"),
        (FillReason::Limit, "Limit"),
        (FillReason::Stop, "Stop"),
        (FillReason::StopLimit, "StopLimit"),
        (FillReason::Sl, "Sl"),
        (FillReason::Tp, "Tp"),
        (FillReason::Signal, "Signal"),
        (FillReason::Manual, "Manual"),
        (FillReason::Trailing, "Trailing"),
    ] {
        assert_eq!(serde_json::to_value(r).expect("r"), json!(name));
        assert_eq!(roundtrip(&r), r);
    }
}

#[test]
fn trailing_spec_json_shape() {
    let t = TrailingSpec { kind: TrailingKind::Atr, value: 14.0 };
    assert_eq!(serde_json::to_value(t).expect("t"), json!({"kind": "Atr", "value": 14.0}));
    let p = TrailingSpec { kind: TrailingKind::Pct, value: 0.01 };
    assert_eq!(roundtrip(&p), p);
}

#[test]
fn trailing_kind_json_names() {
    assert_eq!(serde_json::to_value(TrailingKind::Atr).expect("k"), json!("Atr"));
    assert_eq!(serde_json::to_value(TrailingKind::Pct).expect("k"), json!("Pct"));
}

fn sample_order() -> Order {
    Order {
        id: 1,
        symbol: "BTC/USDT".into(),
        side: Side::Buy,
        order_type: OrderType::Limit,
        price: Some(59_500.0),
        size: 0.2,
        stop_loss: Some(58_900.0),
        take_profit: Some(61_000.0),
        trailing: Some(TrailingSpec { kind: TrailingKind::Atr, value: 14.0 }),
        tif: TimeInForce::Gtc,
        reduce_only: false,
        created_at: 1_700_000_000_000,
        tag: Some("scratch".into()),
    }
}

#[test]
fn order_serde_roundtrip_full() {
    let o = sample_order();
    assert_eq!(roundtrip(&o), o);
}

#[test]
fn order_none_fields_serialize_as_null() {
    let mut o = sample_order();
    o.price = None;
    o.stop_loss = None;
    o.take_profit = None;
    o.trailing = None;
    o.tag = None;
    let v: Value = serde_json::to_value(&o).expect("to value");
    assert_eq!(v["price"], Value::Null);
    assert_eq!(v["stop_loss"], Value::Null);
    assert_eq!(v["take_profit"], Value::Null);
    assert_eq!(v["trailing"], Value::Null);
    assert_eq!(v["tag"], Value::Null);
    assert_eq!(v["tif"], json!("Gtc"));
}

#[test]
fn order_null_fields_deserialize_to_none() {
    let v = json!({
        "id": 2u64, "symbol": "EUR/USD", "side": "Sell", "order_type": "Stop",
        "price": Some(1.0850), "size": 0.1, "stop_loss": null, "take_profit": null,
        "trailing": null, "tif": {"Gtd": 1_700_000_000_000i64},
        "reduce_only": true, "created_at": 1_700_000_000_000i64, "tag": null
    });
    let o: Order = serde_json::from_value(v).expect("from value");
    assert_eq!(o.stop_loss, None);
    assert_eq!(o.side, Side::Sell);
    assert_eq!(o.order_type, OrderType::Stop);
    assert!(o.reduce_only);
    assert_eq!(o.tif, TimeInForce::Gtd(1_700_000_000_000));
}

#[test]
fn order_clone_is_independent() {
    let a = sample_order();
    let mut b = a.clone();
    b.size = 9.9;
    assert_eq!(a.size, 0.2);
    assert_ne!(a.size, b.size);
}

#[test]
fn enums_are_copy_and_eq() {
    let s = Side::Buy;
    let s2 = s; // Copy
    assert_eq!(s, s2);
    let r = FillReason::Sl;
    let r2 = r;
    assert_eq!(r, r2);
}

#[test]
fn fill_serde_roundtrip_full() {
    let f = Fill {
        order_id: 5,
        symbol: "EUR/USD".into(),
        side: Side::Buy,
        price: 1.08510,
        size: 0.1,
        fee: 0.3,
        time: 1_700_000_000_000,
        reason: FillReason::Market,
    };
    assert_eq!(roundtrip(&f), f);
    let v: Value = serde_json::to_value(&f).expect("to value");
    assert_eq!(v["reason"], json!("Market"));
    assert_eq!(v["side"], json!("Buy"));
}

#[test]
fn timestamp_alias_is_i64_milliseconds() {
    fn takes_i64(t: i64) -> Timestamp { t }
    let t = takes_i64(1_700_000_000_123);
    assert_eq!(t % 1000, 123);
}

#[test]
fn bar_partial_eq_distinguishes_values() {
    let a = Bar { time: 1, open: 1.0, high: 1.0, low: 1.0, close: 1.0, volume: 0.0 };
    let mut b = a;
    b.close = 1.0000001;
    assert_ne!(a, b);
}
