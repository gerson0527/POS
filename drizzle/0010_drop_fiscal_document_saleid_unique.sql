-- Permite coexistir el comprobante interno REC y la factura electrónica
-- FACTURA_ELECTRONICA_VENTA para la misma venta. El índice legado
-- fiscal_document_saleId_key impedía insertar la factura cuando ya existía REC,
-- y el ON CONFLICT DO NOTHING descartaba el CUFE en silencio.
DROP INDEX IF EXISTS "fiscal_document_saleId_key";
