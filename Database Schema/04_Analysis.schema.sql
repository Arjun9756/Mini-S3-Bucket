CREATE TABLE IF NOT EXISTS analysis(
    id VARCHAR(100) PRIMARY KEY,
    file_id VARCHAR(100),
    user_id varchar(100),
    date_scan VARCHAR(212),
    stats JSON,
    status enum('dangerous' , 'safe' , 'semiSafe') NOT NULL,
    INDEX index_on_status(status),
    INDEX index_on_fileId(file_id),
    INDEX index_on_userId(user_id),
    FOREIGN KEY (file_Id) REFERENCES files(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);