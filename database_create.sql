-- Table: merkure_receiptLogs

-- DROP TABLE "merkure_receiptLogs";

CREATE TABLE "merkure_receiptLogs"
(
    id serial NOT NULL,
    transport_id text NOT NULL,
    sf_record_id text NOT NULL,
    sf_account_id text,
    date_send date,
    date_receipt date,
    receipt_ok boolean DEFAULT false,
    CONSTRAINT index PRIMARY KEY (id),
    CONSTRAINT transport_id UNIQUE (transport_id)
)