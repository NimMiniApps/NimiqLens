package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWithCORS_SetsHeaderAndCallsNext(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	handler := withCORS("https://example.com", next)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if !called {
		t.Error("expected next handler to be called")
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://example.com" {
		t.Errorf("expected Access-Control-Allow-Origin=https://example.com, got %q", got)
	}
}

func TestWithCORS_HandlesOptionsPreflight(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})

	handler := withCORS("*", next)

	req := httptest.NewRequest(http.MethodOptions, "/api/rates", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if called {
		t.Error("expected next handler not to be called for OPTIONS preflight")
	}
	if w.Code != http.StatusNoContent {
		t.Errorf("expected status 204, got %d", w.Code)
	}
}
