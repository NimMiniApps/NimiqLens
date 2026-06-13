package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// AssetRates holds an asset's price in each supported fiat currency.
type AssetRates struct {
	EUR float64 `json:"EUR"`
	USD float64 `json:"USD"`
	GBP float64 `json:"GBP"`
	CHF float64 `json:"CHF"`
}

// RatesResponse is the normalized payload returned by GET /api/rates.
type RatesResponse struct {
	Rates     map[string]AssetRates `json:"rates"`
	Timestamp string                `json:"timestamp"`
	FetchedAt string                `json:"fetched_at"`
	Stale     bool                  `json:"stale"`
	Source    string                `json:"source"`
}

type coinGeckoPrice struct {
	EUR float64 `json:"eur"`
	USD float64 `json:"usd"`
	GBP float64 `json:"gbp"`
	CHF float64 `json:"chf"`
}

var coinGeckoIDToAsset = map[string]string{
	"nimiq":    "NIM",
	"bitcoin":  "BTC",
	"ethereum": "ETH",
	"tether":   "USDT",
}

// FetchRates fetches NIM, BTC, ETH, and USDT prices in EUR/USD/GBP/CHF from
// CoinGecko's simple price endpoint and normalizes them into a RatesResponse.
func FetchRates(client *http.Client, baseURL string) (RatesResponse, error) {
	url := fmt.Sprintf("%s/simple/price?ids=nimiq,bitcoin,ethereum,tether&vs_currencies=eur,usd,gbp,chf", baseURL)

	resp, err := client.Get(url)
	if err != nil {
		return RatesResponse{}, fmt.Errorf("fetching rates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return RatesResponse{}, fmt.Errorf("coingecko returned status %d", resp.StatusCode)
	}

	var raw map[string]coinGeckoPrice
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return RatesResponse{}, fmt.Errorf("decoding rates: %w", err)
	}

	rates := make(map[string]AssetRates, len(coinGeckoIDToAsset))
	for id, asset := range coinGeckoIDToAsset {
		price, ok := raw[id]
		if !ok {
			return RatesResponse{}, fmt.Errorf("missing price for %s", id)
		}
		rates[asset] = AssetRates{EUR: price.EUR, USD: price.USD, GBP: price.GBP, CHF: price.CHF}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	return RatesResponse{
		Rates:     rates,
		Timestamp: now,
		FetchedAt: now,
		Stale:     false,
		Source:    "CoinGecko",
	}, nil
}
