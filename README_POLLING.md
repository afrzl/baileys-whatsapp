# WhatsApp Polling API

## Endpoints untuk Polling di Grup WhatsApp

### 1. Mendapatkan Daftar Grup

**GET** `/:sessionId/groups`

**Headers:**
```
X-API-Key: your-api-key
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "jid": "120363025343298765@g.us",
      "name": "Grup Testing",
      "description": "Grup untuk testing bot",
      "participantsCount": 5,
      "isAdmin": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "owner": "6281234567890@s.whatsapp.net"
    }
  ],
  "count": 1
}
```

### 2. Membuat Polling di Grup

**POST** `/:sessionId/messages/poll`

**Headers:**
```
X-API-Key: your-api-key
Content-Type: application/json
```

**Body:**
```json
{
  "jid": "120363025343298765@g.us",
  "type": "jid",
  "name": "Pilih makanan favorit?",
  "options": ["Nasi Goreng", "Mie Ayam", "Gado-gado", "Soto"],
  "selectableCount": 1
}
```

**Parameters:**
- `jid`: JID grup (didapat dari endpoint `/groups`)
- `type`: "jid" untuk JID langsung, "number" untuk nomor telepon
- `name`: Pertanyaan atau judul polling
- `options`: Array pilihan (minimal 2, maksimal 12)
- `selectableCount`: Jumlah pilihan yang bisa dipilih user (default: 1)

**Response:**
```json
{
  "success": true,
  "data": {
    "key": {
      "remoteJid": "120363025343298765@g.us",
      "fromMe": true,
      "id": "BAE5F4F0F1F2F3F4F5F6F7F8F9FAFBFC"
    },
    "message": {
      "messageContextInfo": {
        "deviceListMetadata": {},
        "deviceListMetadataVersion": 2
      },
      "pollCreationMessage": {
        "name": "Pilih makanan favorit?",
        "options": [
          { "optionName": "Nasi Goreng" },
          { "optionName": "Mie Ayam" },
          { "optionName": "Gado-gado" },
          { "optionName": "Soto" }
        ],
        "selectableOptionsCount": 1
      }
    }
  }
}
```

## Cara Penggunaan

### 1. Dapatkan JID Grup
```bash
curl -X GET "http://localhost:3000/your-session-id/groups" \
  -H "X-API-Key: your-api-key"
```

### 2. Kirim Polling ke Grup
```bash
curl -X POST "http://localhost:3000/your-session-id/messages/poll" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "jid": "120363025343298765@g.us",
    "type": "jid",
    "name": "Kapan meeting selanjutnya?",
    "options": ["Senin 10:00", "Selasa 14:00", "Rabu 09:00"],
    "selectableCount": 1
  }'
```

## Catatan Penting

1. **Polling hanya bisa dikirim ke grup** (`@g.us`), tidak bisa ke chat personal
2. **Minimal 2 pilihan, maksimal 12 pilihan**
3. **Bot harus sudah tergabung di grup** untuk bisa mengirim polling
4. **JID grup** didapat dari endpoint `/groups` setelah bot join ke grup
5. **selectableCount** menentukan berapa pilihan yang bisa dipilih user (single/multiple choice)

## Format JID Grup
- JID grup selalu berakhiran `@g.us`
- Contoh: `120363025343298765@g.us`
- JID personal berakhiran `@s.whatsapp.net`
