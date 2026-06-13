package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	healthHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	expected := "{\"status\":\"ok\"}\n"
	if w.Body.String() != expected {
		t.Fatalf("expected body %q, got %q", expected, w.Body.String())
	}
}

func TestRatesHandler_Success(t *testing.T) {
	cache := NewRatesCache(60*time.Second, func() (RatesResponse, error) {
		return RatesResponse{
			Rates:     map[string]AssetRates{"NIM": {EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095}},
			Timestamp: "2026-06-13T16:30:00Z",
			FetchedAt: "2026-06-13T16:30:00Z",
			Source:    "CoinGecko",
		}, nil
	})

	req := httptest.NewRequest(http.MethodGet, "/api/rates", nil)
	w := httptest.NewRecorder()

	ratesHandler(cache)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp RatesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Source != "CoinGecko" {
		t.Errorf("expected source CoinGecko, got %q", resp.Source)
	}
	if resp.Rates["NIM"].EUR != 0.01 {
		t.Errorf("unexpected NIM EUR rate: %v", resp.Rates["NIM"].EUR)
	}
}

func TestRatesHandler_Unavailable(t *testing.T) {
	cache := NewRatesCache(60*time.Second, func() (RatesResponse, error) {
		return RatesResponse{}, errors.New("coingecko down")
	})

	req := httptest.NewRequest(http.MethodGet, "/api/rates", nil)
	w := httptest.NewRecorder()

	ratesHandler(cache)(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", w.Code)
	}
}

func TestBalanceHandler_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"jsonrpc":"2.0","result":{"data":{"address":"NQ07 0000 0000 0000 0000 0000 0000 0000 0000","balance":12345000}},"id":1}`)
	}))
	defer server.Close()

	rpcClient := NewNimiqRPCClient(&http.Client{}, server.URL)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/balance/{address}", balanceHandler(rpcClient))

	req := httptest.NewRequest(http.MethodGet, "/api/balance/NQ07%200000%200000%200000%200000%200000%200000%200000%200000", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp BalanceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.BalanceNIM != 123.45 {
		t.Errorf("expected balance_nim 123.45, got %v", resp.BalanceNIM)
	}
}

func TestBalanceHandler_Unavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	rpcClient := NewNimiqRPCClient(&http.Client{}, server.URL)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/balance/{address}", balanceHandler(rpcClient))

	req := httptest.NewRequest(http.MethodGet, "/api/balance/NQ07", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", w.Code)
	}
}
