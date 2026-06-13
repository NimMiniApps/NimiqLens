package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetBalance_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"jsonrpc": "2.0",
			"result": {
				"data": {
					"address": "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
					"balance": 12345000
				}
			},
			"id": 1
		}`)
	}))
	defer server.Close()

	client := NewNimiqRPCClient(&http.Client{}, server.URL)
	resp, err := client.GetBalance("NQ07 0000 0000 0000 0000 0000 0000 0000 0000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Address != "NQ07 0000 0000 0000 0000 0000 0000 0000 0000" {
		t.Errorf("unexpected address: %q", resp.Address)
	}
	if resp.BalanceNIM != 123.45 {
		t.Errorf("expected balance_nim 123.45, got %v", resp.BalanceNIM)
	}
}

func TestGetBalance_RPCError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"jsonrpc": "2.0",
			"error": {"code": -32602, "message": "Invalid address"},
			"id": 1
		}`)
	}))
	defer server.Close()

	client := NewNimiqRPCClient(&http.Client{}, server.URL)
	_, err := client.GetBalance("not-an-address")
	if err == nil {
		t.Fatal("expected error for RPC error response, got nil")
	}
}

func TestGetBalance_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewNimiqRPCClient(&http.Client{}, server.URL)
	_, err := client.GetBalance("NQ07 0000 0000 0000 0000 0000 0000 0000 0000")
	if err == nil {
		t.Fatal("expected error for HTTP 500, got nil")
	}
}
