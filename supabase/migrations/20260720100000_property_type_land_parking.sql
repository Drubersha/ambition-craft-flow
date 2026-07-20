-- Контуры базы: новые типы объектов «Земля» и «Машиноместа».
-- Для контура машиномест площадь объекта/договора = количество мест, ставка = цена места.
ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'land';
ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'parking';
