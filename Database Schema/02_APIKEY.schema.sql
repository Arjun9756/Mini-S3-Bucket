CREATE TABLE IF NOT EXISTS api_keys(
    id varchar(100) PRIMARY KEY,
    user_id varchar(100),
    api_key varchar(256) UNIQUE,
    api_secret_hash varchar(256) UNIQUE,
    permission json,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    FOREIGN KEY (user_id) 
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
