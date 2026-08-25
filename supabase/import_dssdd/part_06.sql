-- Import part 6/6 — 9 rows (upsert by id). Run parts in order.
begin;
insert into ta_entries(id,email,today,leave_type,office_from,office_to,from_date,from_time,to_date,to_time,mode,distance,fare,days,trip,completed,diary_detail,diary_short,ta_short,purpose) values
('777916d0','sarav.bpm@gmail.com','Parent_Office',NULL,'Karur',NULL,'2026-07-31',NULL,'2026-07-31',NULL,NULL,0.0,0.0,0.0,12,'Yes','Account And IPPB Procure',NULL,NULL,'Account And IPPB Procure'),
('24ccd73a','deepak.kledsm@gmail.com','Outside',NULL,'Karur H.O','Tennilai S.O','2026-08-06','10:00','2026-08-06','11:00','Bus',30.0,26.0,0.0,572,'No','Purpose of visit: System Os updation and Symentec antivirus
uninstallation, trend antivirus installation.
Result: System os updation and Os version is changed and others
done.',NULL,'Diary Attached','Purpose of visit: System Os updation and Symentec antivirus
uninstallation, trend antivirus installation.
Result: System os updation and Os version is changed and others
done.'),
('8f2cd646','deepak.kledsm@gmail.com','Outside',NULL,'Tennilai S.O','Karur H.O','2026-08-06','18:30','2026-08-06','19:30','Bus',30.0,26.0,0.7,572,'Yes',NULL,NULL,NULL,NULL),
('b1fa06ae','deepak.kledsm@gmail.com','Outside',NULL,'Karur H.O','Sengunthapuram S.O','2026-08-07','10:00','2026-08-07','10:10','Bike',1.0,0.0,0.0,573,'No','Purpose of visit: Aadhar system application error, trend antivirus
installation in server and client machines.
Result: Aadhar system updation Done. Symentec Removal and os
updation is done and one system is not compatible for av installation.',NULL,'Diary Attached','Purpose of visit: Aadhar system application error, trend antivirus
installation in server and client machines.
Result: Aadhar system updation Done. Symentec Removal and os
updation is done and one system is not compatible for av installation.'),
('4fe5cedb','deepak.kledsm@gmail.com','Leave-CL',NULL,'Karur H.O',NULL,'2026-08-08',NULL,'2026-08-08',NULL,NULL,0.0,0.0,0.0,574,'Yes','Leave-CL',NULL,NULL,'Leave-CL'),
('1d6b8e5f','deepak.kledsm@gmail.com','Holiday',NULL,'Karur H.O',NULL,'2026-08-09',NULL,'2026-08-09',NULL,NULL,0.0,0.0,0.0,575,'Yes','Holiday',NULL,NULL,'Holiday'),
('d6175f84','deepak.kledsm@gmail.com','Outside',NULL,'Karur H.O','Tharagampatti S.O','2026-08-10','10:00','2026-08-10','11:00','Bus',40.0,30.0,0.0,576,'No','Purpose of visit: Adhar software update done, Trend antivirus
installation done. Os updation and symentec antivirus removal.
Result: Done. Av installed in 2 ssytems and 2 systems are not
compatible and with os version.',NULL,'Diary Attached','Purpose of visit: Adhar software update done, Trend antivirus
installation done. Os updation and symentec antivirus removal.
Result: Done. Av installed in 2 ssytems and 2 systems are not
compatible and with os version.'),
('af196bd9','deepak.kledsm@gmail.com','Outside',NULL,'Tharagampatti S.O','Chinthamanipatti SO','2026-08-10','14:30','2026-08-10','15:00','Bus',5.0,7.0,0.0,576,'No','Symentec removal, antivirus installation and os updation and aadhar application open error rectification.',NULL,'Diary Attached','Symentec removal, antivirus installation and os updation and aadhar application open error rectification.'),
('259c7800','deepak.kledsm@gmail.com','Outside',NULL,'Chinthamanipatti SO','Karur H.O','2026-08-10','17:30','2026-08-10','18:45','Bus',35.0,26.0,0.7,576,'Yes',NULL,NULL,NULL,NULL)
on conflict (id) do update set email=excluded.email,today=excluded.today,leave_type=excluded.leave_type,office_from=excluded.office_from,office_to=excluded.office_to,from_date=excluded.from_date,from_time=excluded.from_time,to_date=excluded.to_date,to_time=excluded.to_time,mode=excluded.mode,distance=excluded.distance,fare=excluded.fare,days=excluded.days,trip=excluded.trip,completed=excluded.completed,diary_detail=excluded.diary_detail,diary_short=excluded.diary_short,ta_short=excluded.ta_short,purpose=excluded.purpose;
commit;
