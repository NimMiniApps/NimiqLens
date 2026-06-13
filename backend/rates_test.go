package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchRates_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"nimiq": {"eur": 0.0123, "usd": 0.0134, "gbp": 0.0105, "chf": 0.0119},
			"bitcoin": {"eur": 58000, "usd": 63000, "gbp": 50000, "chf": 56000},
			"ethereum": {"eur": 3200, "usd": 3500, "gbp": 2800, "chf": 3100},
			"tether": {"eur": 0.92, "usd": 1.0, "gbp": 0.79, "chf": 0.88}
		}`)
	}))
	defer server.Close()

	client := &http.Client{}
	resp, err := FetchRates(client, server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Source != "CoinGecko" {
		t.Errorf("expected source CoinGecko, got %q", resp.Source)
	}
	if resp.Stale {
		t.Errorf("expected stale=false")
	}
	if resp.Timestamp == "" {
		t.Errorf("expected non-empty timestamp")
	}

	nim, ok := resp.Rates["NIM"]
	if !ok {
		t.Fatalf("missing NIM rates")
	}
	if nim.EUR != 0.0123 || nim.USD != 0.0134 || nim.GBP != 0.0105 || nim.CHF != 0.0119 {
		t.Errorf("unexpected NIM rates: %+v", nim)
	}

	btc, ok := resp.Rates["BTC"]
	if !ok || btc.USD != 63000 {
		t.Errorf("unexpected BTC rates: %+v", btc)
	}

	eth, ok := resp.Rates["ETH"]
	if !ok || eth.USD != 3500 {
		t.Errorf("unexpected ETH rates: %+v", eth)
	}

	usdt, ok := resp.Rates["USDT"]
	if !ok || usdt.USD != 1.0 {
		t.Errorf("unexpected USDT rates: %+v", usdt)
	}
}

func TestFetchRates_MissingAsset(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"nimiq": {"eur": 0.0123, "usd": 0.0134, "gbp": 0.0105, "chf": 0.0119}
		}`)
	}))
	defer server.Close()

	client := &http.Client{}
	_, err := FetchRates(client, server.URL)
	if err == nil {
		t.Fatal("expected error for missing asset, got nil")
	}
}

func TestFetchRates_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := &http.Client{}
	_, err := FetchRates(client, server.URL)
	if err == nil {
		t.Fatal("expected error for HTTP 500, got nil")
	}
}
