FROM ubuntu:20.04
ARG DEBIAN_FRONTEND=noninteractive
ARG POSTGRES_USER=waxuser
ARG POSTGRES_DB=missingwax
ARG POSTGRES_PW=nightshade900
ENV PGDATA /data/postgresql/data
WORKDIR /apps
RUN apt-get update && apt-get -y upgrade && apt-get -y install npm curl wget htop git vim
RUN apt remove -y libnode-dev

# Install Node.js 16.x
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
apt-get -y install nodejs && \
rm -rf /var/lib/apt/lists/*

COPY . ./
#COPY postgresql.sql .
RUN npm install ./fastify
RUN npm install

# install of postgresql
RUN apt-get update && apt-get install -y postgresql sudo
RUN mkdir -p "$PGDATA" && chown -R postgres:postgres "$PGDATA" && chmod 777 "$PGDATA"
RUN PG_VERSION=$(pg_config --version | awk '{split($NF, a, "."); print a[1]}') && \
    echo "PostgreSQL version: $PG_VERSION" && \
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/$PG_VERSION/main/postgresql.conf && \
    echo "host all waxuser 0.0.0.0/0 md5" >> /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
    sed -i "s|/var/lib/postgresql/$PG_VERSION/main|$PGDATA|g" /etc/postgresql/$PG_VERSION/main/postgresql.conf && \
    sed -i "s|/var/lib/postgresql/$PG_VERSION/main|$PGDATA|g" /etc/postgresql/$PG_VERSION/main/start.conf

USER postgres

# Initialize the PostgreSQL data directory
RUN PG_VERSION=$(pg_config --version | awk '{split($NF, a, "."); print a[1]}') && \
    echo "PostgreSQL version: $PG_VERSION" && \
    /usr/lib/postgresql/$PG_VERSION/bin/initdb -D "$PGDATA"

USER root

RUN service postgresql start && \
sudo -u postgres psql -f ./postgresql.sql > output.log 2>&1
# sudo -u postgres psql -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PW}';" && \
# sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};" && \
# sudo -u postgres psql -c "CREATE SCHEMA ${POSTGRES_DB};" && \
# echo "CREATE TABLE ${POSTGRES_DB}.producer ( id SERIAL PRIMARY KEY, owner_name VARCHAR(12) UNIQUE);" | sudo -u postgres psql -d $POSTGRES_DB && \
# echo "CREATE TABLE ${POSTGRES_DB}.missingblocks ( id SERIAL PRIMARY KEY, producer_id INTEGER NOT NULL, block_number INTEGER, date TIMESTAMP WITH TIME ZONE, round_missed BOOLEAN, blocks_missed BOOLEAN, FOREIGN KEY (producer_id) REFERENCES ${POSTGRES_DB}.producer(id));" | sudo -u postgres psql -d $POSTGRES_DB && \
# sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};" && \
# sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON SCHEMA ${POSTGRES_DB} TO ${POSTGRES_USER};" && \
# sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${POSTGRES_DB} TO ${POSTGRES_USER};" && \
# sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${POSTGRES_DB} TO ${POSTGRES_USER};"

RUN npm install pg

# Install pm2
RUN npm install pm2@latest -g

# Expose PostgreSQL default port
EXPOSE 5432

# Add health check
HEALTHCHECK --interval=30s --timeout=5s CMD pg_isready -U $POSTGRES_USER -d $POSTGRES_DB || exit 1

# Start PostgreSQL service on container startup
CMD service postgresql start && pm2 start streamingBlocks.js --interpreter="node" --name="streamingBlocks" && pm2 start npm --name fastify -- start --prefix ./fastify && tail -f /dev/null
#CMD service postgresql start && tail -f /dev/null

# Set environment variables for PostgreSQL configuration
#ENV PGUSER=waxuser
#ENV PGPASSWORD=nightshade900
#ENV PGDB=missingwax
#ENV PGHOST=localhost
#ENV PGPORT=5432


