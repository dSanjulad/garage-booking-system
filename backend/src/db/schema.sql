-- GarageBookLK: MySQL 8 schema.
-- Apply with  npm run db:reset  (or:  mysql -u root -p < src/db/schema.sql)

CREATE DATABASE IF NOT EXISTS garage_booking_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE garage_booking_db;

-- ---------------------------------------------------------------
-- Users: vehicle owners (customers), garage operators, and admins
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(30),
  role          ENUM('owner','operator','admin') NOT NULL DEFAULT 'owner',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Garages. closed_weekdays is a comma list of JS weekday numbers
-- (0 = Sunday) that slot generation skips. is_verified can only be
-- set by an admin and is shown to customers as a trust signal.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garages (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  operator_id           INT NOT NULL,
  name                  VARCHAR(150) NOT NULL,
  description           TEXT,
  address               VARCHAR(255) NOT NULL,
  city                  VARCHAR(100) NOT NULL,
  phone                 VARCHAR(30),
  latitude              DECIMAL(10,7),
  longitude             DECIMAL(10,7),
  bay_capacity          INT NOT NULL DEFAULT 1,
  opening_time          TIME NOT NULL DEFAULT '08:00:00',
  closing_time          TIME NOT NULL DEFAULT '18:00:00',
  slot_duration_minutes INT NOT NULL DEFAULT 60,
  closed_weekdays       VARCHAR(20) NOT NULL DEFAULT '',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_garages_city (city),
  CHECK (bay_capacity >= 1),
  CHECK (closing_time > opening_time)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Services. Prices vary by vehicle, so each service states which
-- vehicle types it covers and whether its price is exact, a starting
-- price, or only known after an inspection.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  garage_id         INT NOT NULL,
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  price             DECIMAL(10,2) NOT NULL,
  price_type        ENUM('fixed','starting_from','inspection') NOT NULL DEFAULT 'fixed',
  vehicle_types     SET('car','suv','van','motorcycle','three_wheeler','lorry') NOT NULL DEFAULT 'car,suv,van,motorcycle,three_wheeler,lorry',
  duration_minutes  INT NOT NULL DEFAULT 60,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
  INDEX idx_services_garage (garage_id),
  CHECK (price >= 0),
  CHECK (duration_minutes > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Slots: one row per bookable period at a garage. capacity = bays.
-- booked_count is a deliberate denormalisation: it is the single row
-- that gets locked to serialise bookings. The CHECK makes overselling
-- impossible at database level, even if application code is wrong.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  garage_id    INT NOT NULL,
  slot_date    DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  capacity     INT NOT NULL,
  booked_count INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_garage_slot (garage_id, slot_date, start_time),
  FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
  INDEX idx_slots_date (slot_date),
  CONSTRAINT chk_slot_capacity CHECK (booked_count >= 0 AND booked_count <= capacity)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Bookings. slot_id is the slot the appointment starts in; every slot
-- it occupies (a long service spans several) is in booking_slots.
-- status is the booking outcome; job_stage is the progress customers
-- can follow while the vehicle is at the garage.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  garage_id        INT NOT NULL,
  service_id       INT NOT NULL,
  slot_id          INT NOT NULL,
  customer_id      INT NOT NULL,
  vehicle_type     ENUM('car','suv','van','motorcycle','three_wheeler','lorry') NOT NULL DEFAULT 'car',
  vehicle_details  VARCHAR(120),
  status           ENUM('confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'confirmed',
  job_stage        ENUM('scheduled','received','in_service','ready','finished') NOT NULL DEFAULT 'scheduled',
  completed_by     ENUM('operator','customer'),
  notes            VARCHAR(500),
  reminder_sent_at DATETIME,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (garage_id) REFERENCES garages(id),
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  INDEX idx_bookings_customer (customer_id),
  INDEX idx_bookings_garage (garage_id),
  INDEX idx_bookings_slot (slot_id)
) ENGINE=InnoDB;

-- Every slot a booking occupies, including the starting slot.
CREATE TABLE IF NOT EXISTS booking_slots (
  booking_id INT NOT NULL,
  slot_id    INT NOT NULL,
  PRIMARY KEY (booking_id, slot_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (slot_id) REFERENCES slots(id),
  INDEX idx_booking_slots_slot (slot_id)
) ENGINE=InnoDB;

-- Timeline shown on the customer's service tracker.
CREATE TABLE IF NOT EXISTS booking_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  event      VARCHAR(30) NOT NULL,
  note       VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_booking_events_booking (booking_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Reviews: one per booking. Admins can hide a review (with a reason);
-- hidden reviews are excluded from ratings. The rules that make a
-- review "verified" are enforced by the triggers below.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  booking_id    INT NOT NULL UNIQUE,
  garage_id     INT NOT NULL,
  customer_id   INT NOT NULL,
  rating        TINYINT NOT NULL,
  comment       TEXT,
  is_hidden     BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason VARCHAR(255),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (garage_id) REFERENCES garages(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  INDEX idx_reviews_garage (garage_id),
  CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Payments. Sandbox or simulated only; no real money is processed.
-- amount is always calculated on the server.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  booking_id   INT NOT NULL,
  provider     VARCHAR(20) NOT NULL,
  payment_type ENUM('full','deposit') NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  currency     CHAR(3) NOT NULL DEFAULT 'LKR',
  status       ENUM('pending','paid','failed','refunded','refund_due') NOT NULL DEFAULT 'pending',
  order_ref    VARCHAR(64) NOT NULL UNIQUE,
  provider_ref VARCHAR(64),
  paid_at      DATETIME,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_payments_booking (booking_id),
  CHECK (amount > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Notification log: evidence of what was sent, or why it was not.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT,
  kind       VARCHAR(30) NOT NULL,
  channel    ENUM('email','sms') NOT NULL,
  recipient  VARCHAR(180),
  subject    VARCHAR(255),
  status     ENUM('sent','logged','failed') NOT NULL,
  detail     VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- Verified-review rules, enforced by the database so they hold even
-- if a request bypasses the controller. Errors surface as HTTP 409.
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_reviews_verify_insert;
DROP TRIGGER IF EXISTS trg_reviews_lock_update;

DELIMITER $$

CREATE TRIGGER trg_reviews_verify_insert
BEFORE INSERT ON reviews
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_customer INT;
  DECLARE v_garage INT;
  DECLARE v_operator INT;

  SELECT b.status, b.customer_id, b.garage_id, g.operator_id
    INTO v_status, v_customer, v_garage, v_operator
    FROM bookings b
    JOIN garages g ON g.id = b.garage_id
   WHERE b.id = NEW.booking_id;

  IF v_status IS NULL OR v_status <> 'completed' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only review a booking once the service has been completed.';
  END IF;
  IF NEW.customer_id <> v_customer THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only review your own bookings.';
  END IF;
  IF NEW.garage_id <> v_garage THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The review does not match the garage on this booking.';
  END IF;
  IF NEW.customer_id = v_operator THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operators cannot review their own garage.';
  END IF;
END$$

CREATE TRIGGER trg_reviews_lock_update
BEFORE UPDATE ON reviews
FOR EACH ROW
BEGIN
  IF NEW.booking_id <> OLD.booking_id
     OR NEW.customer_id <> OLD.customer_id
     OR NEW.garage_id <> OLD.garage_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A review cannot be moved to another booking.';
  END IF;
END$$

DELIMITER ;
