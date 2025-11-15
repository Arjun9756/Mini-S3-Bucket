CREATE TABLE IF NOT EXISTS files(
    id varchar(100) PRIMARY KEY,
    user_id varchar(100),
    filename varchar(255),
    storage_path varchar(1024),
    size bigint,
    mime_type varchar(100),
    shared_with JSON,
    visibilty char(10) default 'private',
    original_name varchar(512),
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id(user_id)
)