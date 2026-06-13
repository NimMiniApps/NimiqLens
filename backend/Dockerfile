FROM golang:1.24-alpine AS build
WORKDIR /app
COPY go.mod ./
COPY *.go ./
RUN go build -o nimlens-backend .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/nimlens-backend .
EXPOSE 8787
ENV PORT=8787
ENTRYPOINT ["./nimlens-backend"]
