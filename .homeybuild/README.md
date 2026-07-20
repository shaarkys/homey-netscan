# Net Scan

Scan your (local) network with your homey. It currently only supports TCP port scans, but this can be done on an IP only basis. I've created this app to detect if my Xbox 360 is turned on, but really most devices can be detected by this app. All it requires is an IP address (and an open port).

This app was originally developed by Terry Hendrix (<https://bitbucket.org/terryhendrix/homey-netscan/src/master/>) and worked with Homey up to version 4. This branch is for Homey version 5 and later.

It's important to assign your devices a constant IP, either through a DHCP reservation or a static IP.

## Adding devices

### Step 1 - Determine IP address

Lookup for the IP address of the device you want add. Most routers support this on their admin UI's.

### Step 2 - Determine port

Now you have to determine which port you want to add. First install the nmap shell utility.

*Mac OSX*:  

`brew install nmap`

*Linux*:  

`yum install nmap` or `apt-get install nmap` or use another package manager.

*Windows*:  

Follow instructions on [nmap.org](https://nmap.org/book/inst-windows.html)

Now you may scan the IP that you've just looked up. It's 10.0.0.246 in my case, which is my Xbox 360.

Execute `nmap -Pn 10.0.0.246` on the shell or command prompt (for windows). I get the following output:

```Formatted
Starting Nmap 6.47 ( http://nmap.org ) at 2016-10-09 12:46 CEST
Nmap scan report for 10.0.0.246
Host is up (0.0027s latency).
Not shown: 999 filtered ports
PORT     STATE SERVICE
1025/tcp open  NFS-or-IIS

Nmap done: 1 IP address (1 host up) scanned in 6.68 seconds
```

This shows that the NFS service is running on TCP port 1025. No open port found? No biggie, use the IP driver.

### Step 3 - Add the device

Now that we've got all information present, it's time to add the device.

1. Select the TCP port driver if you have found an open port, select the IP address driver if you have not found an open port.

2. Then fill out the form with the IP address (and TCP port) we've just looked up. Also give it a name.

3. You're done.

## Drivers

### TCP Port

The TCP port driver allows to watch a TCP port on a specified IP-address. Any errors trying to connect, including a timeout, will be interpreted as the device being unavailable.

#### TCP Port Triggers

* Device came online
* Device went offline

##### TCP Port conditions

* Device is online
* Device is offline

### IP Address

The IP Address driver can detect a device without requiring an open TCP port. New devices use automatic detection: Homey first attempts to resolve the device using ARP and falls back to checking for a response from a closed TCP port. Existing devices retain the legacy TCP response check unless the detection method is changed in the device's advanced settings.

ARP detection is intended for numeric IPv4 addresses on the same local network as Homey. For hostnames, IPv6 addresses, routed networks, or separate VLANs, use automatic or TCP response detection.

The reachability status is read-only and is updated exclusively by the configured network check.

#### IP Address Triggers

* Device came online
* Device went offline

##### IP Address conditions

* Device is online
* Device is offline
